import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { failureIndex, LAYERED, stiffnessFor, type LayeredMaterial, type V3 } from './material';
import { sampleStresses, solveDisplacement, type StrengthModel } from './solve';
import { voxelize } from './voxels';

const E = 2000;
const NU = 0.3;
const ISOTROPIC: LayeredMaterial = {
  inPlaneMpa: 1,
  acrossMpa: 1,
  shearMpa: 1,
  inPlaneE: E,
  acrossE: E,
  shearG: E / (2 * (1 + NU)),
  poisson: NU,
};

const boxTriangles = (size: V3, center: V3) =>
  new THREE.BoxGeometry(...size).translate(...center).toNonIndexed().attributes.position.array as Float32Array;

const across = (x: number, depth: number) =>
  Array.from({ length: Math.round(depth / 1.5) + 1 }, (_, i) => ({
    from: [x, i * 1.5, -50] as V3,
    to: [x, i * 1.5, 50] as V3,
    radius: 0.01,
  }));

describe('the voxel solver', () => {
  it('matches beam theory for a cantilever within 10%', () => {
    const [length, depth, width, force, far] = [100, 12, 12, 100, 1e6];
    const tris = boxTriangles([length, depth, width], [length / 2, depth / 2, 0]);
    const model: StrengthModel = {
      tris,
      material: ISOTROPIC,
      fill: { infill: 1, shellMm: 0 },
      normal: [0, 0, 1],
      holds: across(0, depth),
      load: {
        origin: [length - far, depth / 2, 0],
        axis: [0, 0, 1],
        torqueNmm: force * far,
        screws: across(length, depth),
      },
    };
    const solved = solveDisplacement(model, voxelize(tris))!;
    const nodal = sampleStresses(solved, stiffnessFor(ISOTROPIC, [0, 0, 1]));
    const second = (width * depth ** 3) / 12;

    for (const x of [30, 50, 70]) {
      const at = Array.from({ length: solved.mesh.positions.length / 3 }, (_, n) => n).filter(
        (n) =>
          Math.abs(solved.mesh.positions[n * 3] - x) < 0.8 && Math.abs(solved.mesh.positions[n * 3 + 1] - depth) < 1e-6,
      );
      const measured = Math.max(...at.map((n) => Math.abs(nodal[n * 6])));
      const theory = (force * x * (depth / 2)) / second;

      expect(Math.abs(measured - theory) / theory).toBeLessThan(0.1);
    }
  });

  it('reads stress across the layers as weaker than along them', () => {
    const pull = [0, 0, 20, 0, 0, 0];
    const pla = LAYERED.PLA!;

    expect(1 / Math.sqrt(failureIndex(pull, [0, 0, 1], pla))).toBeCloseTo(pla.acrossMpa / 20, 5);
    expect(1 / Math.sqrt(failureIndex(pull, [1, 0, 0], pla))).toBeCloseTo(pla.inPlaneMpa / 20, 5);
  });
});
