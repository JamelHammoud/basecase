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
});
