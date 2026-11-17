import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { analysisHandlers, MISSING_SHAPE, type Instance } from './analysisOps';
import { ShapeSolid } from './shapeSolid';

const empty = { keys: [], geometryIds: [] };
const matrix = new THREE.Matrix4().toArray();

afterEach(() => {
  analysisHandlers.retain(empty);
  vi.restoreAllMocks();
});

it.each([0, 300, 600])('prunes interleaved live and stale worker entries across %i shapes', async (count) => {
  analysisHandlers.retain(empty);

  const geometry = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
  const positions = new Float32Array(geometry.attributes.position.array);
  const shapes = Array.from({ length: count }, (_, i) => ({
    key: `shape-${i}`,
    meshes: [{ geometry: `geometry-${i % 3}`, matrix }],
  }));
  const geometries = Array.from({ length: 3 }, (_, i) => ({ id: `geometry-${i}`, positions, index: null }));
  const instances = shapes.map(({ key }) => ({ id: key, key, matrix }));
  const run = (items: Instance[]) =>
    analysisHandlers.analyze({ geometries: [], shapes: [], task: { kind: 'floor', instances: items } });
  const dispose = vi.spyOn(ShapeSolid.prototype, 'dispose');
  const build = vi.spyOn(THREE.Box3.prototype, 'setFromArray');

  geometry.dispose();
  await analysisHandlers.analyze({ geometries, shapes, task: { kind: 'floor', instances } });

  const live = instances.filter((_, i) => i % 3 === 1);
  const keep = { keys: live.map(({ key }) => key), geometryIds: ['geometry-1', 'unknown'] };

  expect(analysisHandlers.retain(keep).result).toEqual({ shapes: live.length, geometries: 1 });
  expect(dispose).toHaveBeenCalledTimes(count - live.length);
  build.mockClear();
  expect((await run(live)).result).toBe(live.length ? -1 : null);
  expect(build).not.toHaveBeenCalled();
  expect(analysisHandlers.retain(keep).result).toEqual({ shapes: live.length, geometries: 1 });
  expect(dispose).toHaveBeenCalledTimes(count - live.length);

  if (!count) return;

  await expect(run([instances[0]])).rejects.toThrow(MISSING_SHAPE);
  await expect(
    analysisHandlers.analyze({
      geometries: [],
      shapes: [shapes[0]],
      task: { kind: 'floor', instances: [instances[0]] },
    }),
  ).rejects.toThrow(MISSING_SHAPE);
  expect(
    (
      await analysisHandlers.analyze({
        geometries: [geometries[0]],
        shapes: [shapes[0]],
        task: { kind: 'floor', instances: [instances[0]] },
      })
    ).result,
  ).toBe(-1);
  expect(analysisHandlers.retain(empty).result).toEqual({ shapes: 0, geometries: 0 });
  expect(dispose).toHaveBeenCalledTimes(count + 1);
});
