import * as THREE from 'three';
import type { Mat4 } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadManifold, meshOfSolid, solidOfMesh, soupOfMesh, type ManifoldApi } from '../wrap/manifold';
import { weld } from './threeMf';
import { CRADLE_ASSEMBLIES, cradleFixture } from './cradle.fixtures';
import { makeCradle } from './cradle';
import { CRADLE_LIMITS, type CradleInput } from './cradleTypes';

let api: ManifoldApi;

beforeAll(async () => {
  api = await loadManifold();
});

function solidOf(positions: Float32Array) {
  const mesh = weld(positions);

  return solidOfMesh(api, { positions: mesh.vertices, indices: mesh.indices })!;
}

function transformed(input: CradleInput, matrix: THREE.Matrix4): CradleInput {
  const point = new THREE.Vector3();

  return {
    ...input,
    down: new THREE.Vector3(...input.down).transformDirection(matrix).toArray(),
    sources: input.sources.map((source) => ({
      ...source,
      positions: Float32Array.from(source.positions, (_, index) => {
        point.fromArray(source.positions, index - (index % 3)).applyMatrix4(matrix);

        return point.getComponent(index % 3);
      }),
    })),
  };
}

describe('assembly cradle geometry', () => {
  it.each(CRADLE_ASSEMBLIES)('clears the complete straight lift of %s without changing its source', (name) => {
    const input = cradleFixture(api, CRADLE_ASSEMBLIES.indexOf(name));
    const before = structuredClone(input);
    const result = makeCradle(api, input);
    const cradle = solidOf(result.positions);
    const source = solidOf(input.sources[0].positions);
    const world = new THREE.Matrix4().fromArray(result.toWorld);
    const worldPositions = result.positions.slice();
    const point = new THREE.Vector3();

    for (let at = 0; at < worldPositions.length; at += 3)
      point.fromArray(worldPositions, at).applyMatrix4(world).toArray(worldPositions, at);

    const worldCradle = solidOf(worldPositions);
    const shadow = source.project();
    const sweep = shadow.extrude(60);
    const collision = worldCradle.intersect(sweep);

    expect(collision.isEmpty()).toBe(true);
    expect(cradle.status()).toBe('NoError');
    expect(result.supportAreaMm2).toBeGreaterThanOrEqual(CRADLE_LIMITS.minSupportAreaMm2);
    expect(result.cavityAreaMm2).toBeGreaterThan(shadow.area());
    expect(result.sourceIds).toEqual(input.sources.map((source) => source.id));
    expect(input).toEqual(before);
    [cradle, source, worldCradle, sweep, collision].forEach((solid) => solid.delete());
    shadow.delete();
  });

  it('retains a chosen face under rigid rotation and translation', () => {
    const input = cradleFixture(api, 0);
    const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.4, 0.8, -0.3));

    matrix.setPosition(120, -65, 200);

    const original = makeCradle(api, input);
    const result = makeCradle(api, transformed(input, matrix));

    expect(result.supportAreaMm2).toBeCloseTo(original.supportAreaMm2, 2);
    expect(result.cavityAreaMm2).toBeCloseTo(original.cavityAreaMm2, 2);

    const source = solidOf(input.sources[0].positions);
    const shadow = source.project();
    const lift = shadow.extrude(60);
    const rotatedLift = lift.transform(matrix.elements as Mat4);
    const cradle = solidOf(result.positions);
    const worldCradle = cradle.transform(result.toWorld as Mat4);
    const collision = worldCradle.intersect(rotatedLift);

    expect(collision.isEmpty()).toBe(true);
    [source, lift, rotatedLift, cradle, worldCradle, collision].forEach((solid) => solid.delete());
    shadow.delete();
  });

  it('changes the actual cavity with clearance while retaining the requested base and depth', () => {
    const input = cradleFixture(api, 1);
    const first = makeCradle(api, input);
    const second = makeCradle(api, { ...input, clearanceMm: 0.8, baseMm: 4 });
    const firstSolid = solidOf(first.positions);
    const secondSolid = solidOf(second.positions);
    const firstBounds = firstSolid.boundingBox();
    const secondBounds = secondSolid.boundingBox();

    expect(firstBounds.min[1]).toBeCloseTo(0, 5);
    expect(firstBounds.max[1]).toBeCloseTo(input.baseMm + input.depthMm, 5);
    expect(secondBounds.max[1]).toBeCloseTo(4 + input.depthMm, 5);
    expect(second.cavityAreaMm2).toBeGreaterThan(first.cavityAreaMm2);
    expect(secondBounds.max[0] - firstBounds.max[0]).toBeCloseTo(0.5 / Math.cos(Math.PI / 32), 3);
    firstSolid.delete();
    secondSolid.delete();
  });

  it('retains every source identity when two prepared members form one supported assembly', () => {
    const input = cradleFixture(api, 0);
    const positions = Float32Array.from(input.sources[0].positions, (value, index) =>
      index % 3 === 0 ? value + 10 : value,
    );
    const sources = [...input.sources, { id: 'second bracket', positions }];
    const before = structuredClone(sources);
    const result = makeCradle(api, { ...input, sources });

    expect(result.sourceIds).toEqual(['servo bracket', 'second bracket']);
    expect(sources).toEqual(before);
  });

  it('refuses oversized sources, excessive triangles, missing identities and nonfinite geometry', () => {
    const input = cradleFixture(api, 0);
    const oversize = api.Manifold.cube([401, 30, 20]);
    const positions = soupOfMesh(meshOfSolid(oversize));
    const nonfinite = input.sources[0].positions.slice();

    nonfinite[0] = Infinity;
    expect(() => makeCradle(api, { ...input, sources: [{ id: 'large', positions }] })).toThrow('cradle:limit');
    expect(() =>
      makeCradle(api, { ...input, sources: [{ id: 'dense', positions: new Float32Array(20_001 * 9) }] }),
    ).toThrow('cradle:limit');
    expect(() => makeCradle(api, { ...input, sources: [{ id: 'broken', positions: nonfinite }] })).toThrow(
      'cradle:mesh',
    );
    expect(() => makeCradle(api, { ...input, sources: [] })).toThrow('cradle:input');
    expect(() => makeCradle(api, { ...input, sources: [input.sources[0], input.sources[0]] })).toThrow('cradle:input');
    oversize.delete();
  });

  it('refuses an undercut, open mesh, inadequate support, nonplanar face and unsupported limits', () => {
    const input = cradleFixture(api, 0);
    const base = api.Manifold.cube([30, 30, 20]);
    const tool = api.Manifold.cube([30, 20, 4]);
    const moved = tool.translate([5, 5, 5]);
    const undercut = base.subtract(moved);
    const sliver = api.Manifold.cube([1, 1, 20]);
    const ball = api.Manifold.sphere(10, 32);
    const meshes = [undercut, sliver, ball].map((solid) => soupOfMesh(meshOfSolid(solid)));

    expect(() => makeCradle(api, { ...input, sources: [{ id: 'undercut', positions: meshes[0] }] })).toThrow(
      'cradle:undercut',
    );
    expect(() => makeCradle(api, { ...input, sources: [{ id: 'sliver', positions: meshes[1] }] })).toThrow(
      'cradle:support',
    );
    expect(() => makeCradle(api, { ...input, sources: [{ id: 'ball', positions: meshes[2] }] })).toThrow('cradle:face');
    expect(() => makeCradle(api, { ...input, sources: [{ id: 'open', positions: meshes[0].slice(9) }] })).toThrow(
      'cradle:mesh',
    );
    expect(() => makeCradle(api, { ...input, wallMm: 0.5 })).toThrow('cradle:wall');
    expect(() => makeCradle(api, { ...input, depthMm: 31 })).toThrow('cradle:limit');
    expect(() => makeCradle(api, { ...input, clearanceMm: NaN })).toThrow('cradle:input');
    [base, tool, moved, undercut, sliver, ball].forEach((solid) => solid.delete());
  });
});
