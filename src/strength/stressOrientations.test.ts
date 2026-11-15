import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { LAYERED, type V3 } from './material';
import { solveStrength, type StrengthModel } from './solve';
import * as indices from './stressIndices';

afterEach(() => vi.restoreAllMocks());

function model(): StrengthModel {
  return {
    tris: new THREE.BoxGeometry(24, 9, 9).translate(12, 0, 0).toNonIndexed().attributes.position.array,
    material: LAYERED.PLA!,
    fill: { infill: 1, shellMm: 0 },
    normal: [0, 0, 1],
    cellMm: 1.5,
    load: {
      origin: [0, 0, 0],
      axis: [0, 0, 1],
      torqueNmm: 500,
      screws: [{ from: [24, -5, 0], to: [24, 5, 0], radius: 0.5 }],
    },
    holds: [{ from: [0, -5, 0], to: [0, 5, 0], radius: 0.5 }],
  };
}

it.each([0, 3, 12])('builds one displayed field with %i candidate print faces and one shared node buffer', (count) => {
  const chosen = solveStrength(model())!;
  const normal: V3 = [1, 0, 0];
  const alternate = solveStrength({ ...model(), normals: [normal] })!;
  const buildField = vi.spyOn(indices, 'stressRatios');
  const grade = vi.spyOn(indices, 'stressIndices');
  const normals = Array.from({ length: count }, (_, i) => (i % 2 ? ([0, 0, 1] as V3) : normal));
  const result = solveStrength({ ...model(), normals })!;

  expect(chosen.factor).toBeGreaterThan(0);
  expect(chosen.factor).toBeLessThan(Infinity);
  expect(alternate.factors[0]).not.toBe(chosen.factor);
  expect({ ...result, factors: [] }).toEqual(chosen);
  expect(result.factors).toEqual(normals.map((_, i) => (i % 2 ? chosen.factor : alternate.factors[0])));
  expect(buildField).toHaveBeenCalledTimes(1);
  expect(grade).toHaveBeenCalledTimes(count + 1);
  expect(new Set(grade.mock.calls.map((call) => call[2].indices)).size).toBe(1);
  expect(buildField.mock.calls[0][0]).toHaveLength(result.cells * 8);
});
