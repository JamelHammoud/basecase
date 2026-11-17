import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScenePart } from '../../types/robotics';
import { buildPartGroup, releasePartGroup } from '../buildPartMesh';
import { geometryHandlers } from '../geometryOps';
import { creaseEdgesOnly } from './creaseEdges';

const edge = [0, 0, 0, 10, 0, 0];
const reverse = [10, 0, 0, 0, 0, 0];
const indices = [0, 1, 2, 1, 0, 3];

function folded(degrees: number) {
  const angle = THREE.MathUtils.degToRad(degrees);

  return [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, -10 * Math.cos(angle), 10 * Math.sin(angle)];
}

function grid(size: number) {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y <= size; y++) {
    for (let x = 0; x <= size; x++) positions.push(x, y, 0);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = y * (size + 1) + x;
      const b = a + 1;
      const c = a + size + 1;

      indices.push(a, b, c, b, c + 1, c);
    }
  }

  return { positions, indices };
}

afterEach(() => vi.restoreAllMocks());

describe('CAD crease edges', () => {
  it.each([0, 10, 19.99])('removes a seam folded by %s degrees', (degrees) => {
    expect(creaseEdgesOnly(edge, folded(degrees), indices)).toEqual([]);
  });

  it.each([20.01, 45, 90, 180])('keeps a crease folded by %s degrees', (degrees) => {
    expect(creaseEdgesOnly(edge, folded(degrees), indices)).toEqual(edge);
  });

  it('keeps boundary, unmatched and non-manifold edges in source order with duplicates', () => {
    const positions = folded(0);
    const boundary = [0, 0, 0, 0, 10, 0];
    const unmatched = [80, 0, 0, 90, 0, 0];
    const requested = [...reverse, ...boundary, ...edge, ...unmatched, ...reverse];
    const source = structuredClone({ positions, requested, indices });

    expect(creaseEdgesOnly(requested, positions, indices)).toEqual([...boundary, ...unmatched]);
    expect(creaseEdgesOnly(requested, [...positions, 0, 0, 10], [...indices, 0, 1, 4])).toEqual(requested);
    expect(creaseEdgesOnly(edge, positions, [0, 1, 2])).toEqual(edge);
    expect({ positions, requested, indices }).toEqual(source);
  });

  it.each<[number, number[]]>([
    [0.004, []],
    [0.006, edge],
  ])('matches split vertices with the existing 0.01 mm coordinate rounding at %s mm', (offset, expected) => {
    const positions = [...folded(0).slice(0, 9), offset, 0, 0, 10 + offset, 0, 0, 0, -10, 0];

    expect(creaseEdgesOnly(edge, positions, [0, 1, 2, 4, 3, 5])).toEqual(expected);
  });

  it('retains degenerate faces and ignores incomplete final faces and segments', () => {
    expect(creaseEdgesOnly(edge, folded(0), [0, 1, 0, 1, 0, 1])).toEqual(edge);
    expect(creaseEdgesOnly([...edge, 7, 8], folded(0), [...indices, 0, 1])).toEqual([]);
    expect(creaseEdgesOnly(edge, [], [])).toEqual(edge);
  });

  it.each([300, 600])('calculates only adjacent face normals among %s unrelated faces', (count) => {
    const positions = folded(90);
    const faces = [...indices];

    for (let i = 0; i < count; i++) {
      const at = positions.length / 3;
      const x = 100 + i * 20;

      positions.push(x, 0, 0, x + 10, 0, 0, x, 10, 0);
      faces.push(at, at + 1, at + 2);
    }

    const normals = vi.spyOn(THREE.Triangle.prototype, 'getNormal');

    expect(creaseEdgesOnly([...edge, ...reverse], positions, faces)).toEqual([...edge, ...reverse]);
    expect(normals).toHaveBeenCalledTimes(2);
    expect(new Set(normals.mock.calls.map(([target]) => target)).size).toBe(1);
  });

  it('does no mesh work without a complete requested segment', () => {
    const normals = vi.spyOn(THREE.Triangle.prototype, 'getNormal');

    expect(creaseEdgesOnly([], folded(0), indices)).toEqual([]);
    expect(creaseEdgesOnly([0, 0, 0], folded(0), indices)).toEqual([]);
    expect(normals).not.toHaveBeenCalled();
  });

  it.each([0, 90])('uses the same segments in the packed worker and fallback build at %s degrees', (degrees) => {
    const boundary = [0, 0, 0, 0, 10, 0];
    const positions = folded(degrees);
    const requested = [...edge, ...boundary];
    const expected = degrees === 0 ? boundary : requested;
    const worker = geometryHandlers.creaseEdges({
      edges: requested,
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
    });
    const part: ScenePart = {
      id: 'folded',
      name: 'Folded plate',
      kind: 'cad_part',
      category: 'primitives',
      role: 'solid',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      dimensions: { width: 10, height: 10, depth: 10 },
      color: '#888888',
      note: '',
      visible: true,
      locked: false,
      cad: {
        language: 'replicad',
        code: '',
        positions,
        indices,
        edges: requested,
        baseSize: [10, 10, 10],
        originOffset: [0, 0, 0],
      },
    };
    const group = buildPartGroup(part, false);
    const lines = group.getObjectByName('cad-edges') as THREE.LineSegments;

    expect(Array.from(worker.result)).toEqual(expected);
    expect(Array.from(lines.geometry.getAttribute('position').array)).toEqual(expected);
    releasePartGroup(group);
  });

  it('reads changed positions afresh on each call', () => {
    const positions = folded(0);

    expect(creaseEdgesOnly(edge, positions, indices)).toEqual([]);
    positions[0] = 2;
    expect(creaseEdgesOnly(edge, positions, indices)).toEqual(edge);
  });

  it.each([16, 32])('reuses vertex keys across an indexed grid with %s cells per side', (size) => {
    const { positions, indices: faces } = grid(size);
    let reads = 0;
    const counted = positions.map((value, index) => {
      Object.defineProperty(positions, index, {
        get: () => {
          reads++;

          return value;
        },
      });

      return value;
    });
    const requested = [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0];
    const normals = vi.spyOn(THREE.Triangle.prototype, 'getNormal');

    expect(creaseEdgesOnly(requested, positions, faces)).toEqual(requested.slice(0, 6));
    expect(reads).toBe(positions.length + 18);
    expect(normals).toHaveBeenCalledTimes(2);
    expect(positions).toEqual(counted);
  });
});

it.each([300, 600])('retains a non-manifold edge shared by %s faces without retaining face normals', (count) => {
  const positions = folded(0);
  const faces: number[] = [];

  for (let i = 0; i < count; i++) faces.push(...indices.slice((i % 2) * 3, (i % 2) * 3 + 3));

  const normals = vi.spyOn(THREE.Triangle.prototype, 'getNormal');

  expect(creaseEdgesOnly([...edge, ...reverse, ...edge], positions, faces)).toEqual([...edge, ...reverse, ...edge]);
  expect(normals).toHaveBeenCalledTimes(count);
  expect(new Set(normals.mock.calls.map(([target]) => target)).size).toBe(1);
});
