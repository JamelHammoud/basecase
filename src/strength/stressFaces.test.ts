import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { failureIndex, LAYERED, stiffnessFor, type V3 } from './material';
import { sampleStresses, solveDisplacement, solveStrength, type StrengthModel } from './solve';
import { voxelize } from './voxels';

const NORMALS: V3[] = [
  [1, 0, 0],
  [0, -1, 0],
  [0, 0, 1],
  [1, 2, -3],
  [-1, 2, 3],
  [0, 0, 0],
];

function fixture(material: keyof typeof LAYERED): StrengthModel {
  const line = (x: number) => ({ from: [x, 6, -5] as V3, to: [x, 6, 15] as V3, radius: 0.1 });

  return {
    tris: new THREE.BoxGeometry(30, 12, 9).translate(15, 6, 4.5).toNonIndexed().attributes.position.array,
    material: LAYERED[material]!,
    fill: { infill: 0.3, shellMm: 0.84 },
    normal: [0, 0, 1],
    cellMm: 3,
    holds: [line(0)],
    load: { origin: [-10, 6, 4.5], axis: [0, 0, 1], torqueNmm: 1200, screws: [line(30)] },
  };
}

function reference(model: StrengthModel) {
  const solved = solveDisplacement(model, voxelize(model.tris, model.cellMm))!;
  const { mesh } = solved;
  const stress = sampleStresses(solved, stiffnessFor(model.material, model.normal));
  const incident = Array.from({ length: mesh.positions.length / 3 }, () => 0);
  const cells = Array.from(mesh.cells, (_, e) => Array.from(mesh.nodes.slice(e * 8, e * 8 + 8)));
  let pinned = new Set(Array.from(solved.pinned.keys()).filter((node) => solved.pinned[node]));

  mesh.nodes.forEach((node) => incident[node]++);

  for (let ring = 0; ring < 2; ring++) {
    const touched = cells.filter((cell) => cell.some((node) => pinned.has(node)));

    pinned = new Set([...pinned, ...touched.flat()]);
  }

  const fieldFor = (normal: V3) => {
    const length = Math.hypot(...normal) || 1;
    const unit = normal.map((v) => v / length) as V3;
    const indices = Float32Array.from(incident, (count, node) =>
      pinned.has(node) || (count >= 5 && count <= 7)
        ? 0
        : failureIndex(stress.slice(node * 6, node * 6 + 6), unit, model.material),
    );
    const worst = Math.max(0, ...indices);
    const at = Math.max(0, indices.indexOf(worst)) * 3;

    return {
      factor: worst > 0 ? 1 / Math.sqrt(worst) : Infinity,
      worst: Array.from(mesh.positions.slice(at, at + 3)),
      ratio: Float32Array.from(cells, (cell) => Math.sqrt(Math.max(...cell.map((node) => indices[node])))),
    };
  };

  return { chosen: fieldFor(model.normal), factors: (model.normals ?? []).map((normal) => fieldFor(normal).factor) };
}

describe('Strength print-face summaries', () => {
  it.each(['PLA', 'PETG', 'ABS', 'ASA'] as const)(
    'keeps %s factors, first worst node and the selected heatmap across candidate faces and edits',
    (material) => {
      const model = { ...fixture(material), normals: [...NORMALS, NORMALS[2], NORMALS[0]] };

      for (const torqueNmm of [1200, -600, 0]) {
        model.load.torqueNmm = torqueNmm;
        model.normal = torqueNmm > 0 ? NORMALS[2] : NORMALS[3];

        const before = structuredClone(model);
        const expected = reference(model);
        const actual = solveStrength(model)!;

        expect(actual.factor).toBe(expected.chosen.factor);
        expect(actual.worst).toEqual(expected.chosen.worst);
        expect(actual.field.ratio).toEqual(expected.chosen.ratio);
        expect(actual.factors).toEqual(expected.factors);
        expect(actual.factors[torqueNmm > 0 ? 2 : 3]).toBe(actual.factor);
        expect(model).toEqual(before);

        if (torqueNmm) expect(actual.field.ratio.some((value) => value > 0)).toBe(true);
      }
    },
  );

  it.each([0, 6, 12])('retains one heatmap with %s alternate faces', (count) => {
    const model = { ...fixture('PLA'), normals: Array.from({ length: count }, (_, i) => NORMALS[i % NORMALS.length]) };
    const baseline = solveStrength({ ...model, normals: [] })!;
    const allocations: number[] = [];
    const measured = new Proxy(Float32Array, {
      construct(target, args) {
        const array = Reflect.construct(target, args) as Float32Array;

        allocations.push(array.length);

        return array;
      },
    });

    vi.stubGlobal('Float32Array', measured);

    try {
      const actual = solveStrength(model)!;

      expect({ ...actual, factors: [] }).toEqual(baseline);
      expect(actual.factors).toHaveLength(count);
      expect(allocations).toEqual([220, baseline.cells]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps a missing load path unresolved without building a heatmap', () => {
    const model = fixture('PLA');

    model.holds = [];
    model.normals = NORMALS;

    expect(solveStrength(model)).toBeNull();
  });
});
