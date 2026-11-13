import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildPartGroup } from '../three/buildPartMesh';
import { measureObject } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';
import { evaluateBoolean, knownResult } from './evaluate';
import { booleanHash, isStale } from './hash';
import { editWithOperands } from './operands';
import { booleanPart, findPartDeep, withResult, type BooleanPart } from './parts';
import { partsWithResults } from './results';

const part = (over: Partial<ScenePart> & Pick<ScenePart, 'id' | 'kind'>): ScenePart => ({
  name: over.id,
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height: 20, depth: 30 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  ...over,
});

const box = part({ id: 'box', kind: 'box', name: 'Plate', position: [0, 10, 0] });
const cylinder = part({
  id: 'cyl',
  kind: 'cylinder',
  role: 'cutout',
  position: [0, 10, 0],
  dimensions: { width: 10, height: 30, depth: 10 },
});

async function evaluated(p: BooleanPart): Promise<BooleanPart> {
  return withResult(p, booleanHash(p), await evaluateBoolean(p));
}

const plateMinusHole = () => evaluated(booleanPart({ id: 'result', base: box, tools: [cylinder], op: 'subtract' }));

const solidHit = (p: ScenePart, x: number, z: number) => {
  const group = buildPartGroup(p, false);

  group.updateMatrixWorld(true);

  return new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0)).intersectObject(group, true)
    .length;
};

describe('editable booleans', () => {
  it('subtracts a cylinder from a box within 1% of the analytic volume', async () => {
    const result = await plateMinusHole();
    const segments = 32;
    const polygonArea = (segments / 2) * 25 * Math.sin((2 * Math.PI) / segments);
    const expected = 40 * 20 * 30 - polygonArea * 20;
    const { volumeMm3 } = measureObject(buildPartGroup(result, false));

    expect(result.kind).toBe('boolean');
    expect(result.name).toBe('Plate');
    expect(result.boolean.operands.map((o) => o.id)).toEqual(['box', 'cyl']);
    expect(Math.abs(volumeMm3 - expected) / expected).toBeLessThan(0.01);
    expect(Math.abs(volumeMm3 - (24000 - Math.PI * 25 * 20)) / volumeMm3).toBeLessThan(0.01);
  });

  it('moves the hole when the cylinder operand moves, and keeps the bounds', async () => {
    const result = await plateMinusHole();
    const moved = editWithOperands([result], (parts) =>
      parts.map((p) => (p.id === 'cyl' ? { ...p, position: [10, 10, 0] as [number, number, number] } : p)),
    );
    const stale = moved[0] as BooleanPart;

    expect(isStale(stale)).toBe(true);
    expect(findPartDeep(moved, 'cyl')?.position).toEqual([10, 10, 0]);

    await evaluateBoolean(stale);

    const [next] = partsWithResults(moved, knownResult) as BooleanPart[];

    expect(isStale(next)).toBe(false);
    expect(next.dimensions).toEqual(result.dimensions);
    expect(next.position).toEqual(result.position);
    expect(solidHit(result, 0, 0)).toBe(0);
    expect(solidHit(next, 0, 0)).toBeGreaterThan(0);
    expect(solidHit(next, 10, 0)).toBe(0);
  });

  it('carries the operands along when the result moves, without evaluating again', async () => {
    const result = await plateMinusHole();
    const [moved] = editWithOperands([result], (parts) =>
      parts.map((p) => (p.id === 'result' ? { ...p, position: [5, 10, -5] as [number, number, number] } : p)),
    ) as BooleanPart[];

    expect(isStale(moved)).toBe(false);
    expect(findPartDeep([moved], 'cyl')?.position).toEqual([5, 10, -5]);
  });

  it('saves and loads a boolean unchanged', async () => {
    const result = await plateMinusHole();
    const loaded = JSON.parse(JSON.stringify([result])) as BooleanPart[];

    expect(loaded).toEqual([result]);
    expect(isStale(loaded[0])).toBe(false);
  });

  it('loads an old sculpt_mesh boolean unchanged', () => {
    const old = part({
      id: 'old',
      kind: 'sculpt_mesh',
      name: 'Plate (Cutouts Carved)',
      sculptMesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2] },
    });
    const parts = [old, box];

    expect(editWithOperands(parts, (p) => p)).toEqual(parts);
    expect(partsWithResults(parts, knownResult)).toBe(parts);
    expect(buildPartGroup(old, false).children.length).toBeGreaterThan(0);
  });

  it('gives no result when the parts do not overlap', async () => {
    const apart = { ...cylinder, position: [200, 10, 0] as [number, number, number] };

    expect(await evaluateBoolean(booleanPart({ id: 'r', base: box, tools: [apart], op: 'intersect' }))).toBeNull();
  });
});
