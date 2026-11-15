import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import * as elastic from './elasticPattern';
import { lightenPart, type LightenInput } from './lighten';
import type { StrengthJob, V3 } from './types';
import { loadManifold, solidOfMesh } from '../wrap/manifold';
import { weld } from '../print/threeMf';
import { optimizeDensity } from './lightenOptimize';
import { frozenQuery, frozenRegions } from './lightenFrozen';
import { voxelizeAt } from './voxels';
import { bvhOf } from '../three/printability';
import { validateLighten } from './lightenValidate';

function fixture(length = 36): LightenInput {
  const positions = new THREE.BoxGeometry(length, 18, 9).translate(length / 2, 0, 0).toNonIndexed().attributes.position
    .array as Float32Array;
  const across = (x: number) => [{ from: [x, -9, 0] as V3, to: [x, 9, 0] as V3, radius: 2 }];
  const job: StrengthJob = {
    key: 'bracket',
    part: 'bracket',
    material: 'PLA',
    infillPct: 100,
    down: [0, 0, -1],
    load: { origin: [0, 0, 0], axis: [0, 0, 1], torqueNmm: 500, screws: across(0) },
    holds: across(length),
  };

  return {
    positions,
    jobs: [job],
    targetShare: 0.5,
    minWallMm: 1.5,
    frozen: { boxes: [{ min: [0, -9, -4.5], max: [3, 9, 4.5] }] },
  };
}

describe('lightening a loaded printed bracket', () => {
  it('minimizes elastic compliance and removes at least thirty percent deterministically', async () => {
    const input = fixture();
    const before = input.positions.slice();
    const result = await lightenPart(input);
    const repeated = await lightenPart(input);

    expect(result.volumeShare).toBeLessThanOrEqual(input.targetShare + 0.02);
    expect(result.volumeShare).toBeGreaterThan(0.1);
    expect(result.compliance.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    expect(result.positions).toEqual(repeated.positions);
    expect(input.positions).toEqual(before);
    expect(result.iterations).toBeGreaterThan(1);
    expect(result.cellMm).toBeGreaterThanOrEqual(1);
    expect(result.cellMm).toBeLessThanOrEqual(1.5);
  }, 30000);

  it('keeps the original interface surface and returns a closed solid', async () => {
    const input = fixture();
    const result = await lightenPart(input);
    const api = await loadManifold();
    const original = weld(Float32Array.from(input.positions));
    const made = weld(result.positions);
    const before = solidOfMesh(api, { positions: original.vertices, indices: original.indices })!;
    const after = solidOfMesh(api, { positions: made.vertices, indices: made.indices })!;
    const region = api.Manifold.cube([2.5, 18, 9]).translate([0, -9, -4.5]);
    const expected = before.intersect(region);
    const actual = after.intersect(region);
    const missing = expected.subtract(actual);
    const extra = actual.subtract(expected);

    expect(after.status()).toBe('NoError');
    expect(missing.volume()).toBeCloseTo(0, 5);
    expect(extra.volume()).toBeCloseTo(0, 5);
    [before, after, region, expected, actual, missing, extra].forEach((solid) => solid.delete());
  }, 30000);

  it('reduces the finite element compliance objective and responds to every load case', () => {
    const input = fixture(24);
    const grid = voxelizeAt(input.positions, 1.5);
    const single = optimizeDensity(grid, input, frozenRegions(input));
    const other: StrengthJob = { ...input.jobs[0], key: 'crosswise', load: { ...input.jobs[0].load, axis: [0, 1, 0] } };
    const both = { ...input, jobs: [...input.jobs, other] };
    const preparation = vi.spyOn(elastic, 'elasticPattern');
    const combined = optimizeDensity(grid, both, frozenRegions(both));

    expect(preparation).toHaveBeenCalledTimes(1);
    preparation.mockRestore();

    const normalized = combined.compliance.reduce(
      (sum, value, index) => sum + value / combined.baselineCompliance[index],
      0,
    );

    expect(single.compliance[0]).toBeLessThan(single.baselineCompliance[0]);
    expect(combined.compliance).toHaveLength(2);
    expect(normalized).toBeLessThan(2);
    expect(combined.density.some((value, index) => Math.abs(value - single.density[index]) > 0.01)).toBe(true);
  }, 30000);

  it('keeps reconstructed interior walls at the requested thickness', async () => {
    const input = fixture();
    const result = await lightenPart(input);
    const bvh = bvhOf(result.positions);
    const isFrozen = frozenQuery(frozenRegions(input), 0.1);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    const ray = new THREE.Ray();
    let tested = 0;
    let thinArea = 0;

    for (let t = 0; t < result.positions.length; t += 9) {
      a.fromArray(result.positions, t);
      b.fromArray(result.positions, t + 3);
      c.fromArray(result.positions, t + 6);
      n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));

      const area = n.length() / 2;

      n.normalize();
      ray.origin
        .copy(a)
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3)
        .addScaledVector(n, -0.001);
      ray.direction.copy(n).negate();

      if (isFrozen(ray.origin.toArray() as V3)) continue;

      const hit = bvh.raycastFirst(ray, THREE.DoubleSide);

      if (!hit?.face || hit.face.normal.dot(ray.direction) <= 0) continue;

      tested++;
      thinArea += hit.distance + 0.001 < input.minWallMm ? area : 0;
    }

    expect(tested).toBeGreaterThan(100);
    expect(thinArea).toBeLessThan(1);
    bvh.geometry.dispose();
  }, 30000);

  it('keeps every voxel axis at or below 1.5 mm on non-divisible dimensions', () => {
    const positions = new THREE.BoxGeometry(11, 3, 4).toNonIndexed().attributes.position.array as Float32Array;
    const input = { ...fixture(), positions };
    const grid = voxelizeAt(positions, validateLighten(input));

    expect(Math.max(...grid.h)).toBeLessThanOrEqual(1.5);
    expect(grid.n).toEqual([8, 2, 3]);
  });

  it('uses every load case and rejects unloaded or impossible requests', async () => {
    const input = fixture();

    await expect(lightenPart({ ...input, jobs: [] })).rejects.toThrow();
    await expect(lightenPart({ ...input, minWallMm: 0 })).rejects.toThrow();
    await expect(lightenPart({ ...input, targetShare: 1 })).rejects.toThrow();
    await expect(lightenPart({ ...input, minWallMm: 10 })).rejects.toThrow();

    const huge = new THREE.BoxGeometry(5000, 5000, 5000).toNonIndexed().attributes.position.array as Float32Array;

    expect(() => validateLighten({ ...input, positions: huge })).toThrow('grid limit');
    await expect(
      lightenPart({ ...input, jobs: [{ ...input.jobs[0], load: { ...input.jobs[0].load, axis: [0, 0, 0] } }] }),
    ).rejects.toThrow();
  });
});
