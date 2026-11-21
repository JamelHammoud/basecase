import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { snapshotShapes, type SceneShapes } from './sceneShapes';
import { printReportsCache } from './printReportCache';
import { analysisHandlers } from './analysisOps';
import { copyGeometries } from './sceneShapes';
import type { Instance } from './analysisOps';
import type { ShapeReport } from './shapeReports';

async function reportsFor(
  scene: SceneShapes,
  instances: Instance[],
  faces?: Record<string, [number, number, number][]>,
) {
  return (
    await analysisHandlers.analyze({
      shapes: [...scene.shapes.values()],
      geometries: await copyGeometries(scene, [...scene.geometries.keys()]),
      task: { kind: 'print', instances, faces },
    })
  ).result as Record<string, ShapeReport>;
}

it('reuses actual print analysis through overlap, placement edits and aliases while isolating geometry, faces and results', async () => {
  const geometry = new THREE.BoxGeometry(20, 10, 15);
  const objects = Array.from({ length: 60 }, (_, index) => ({
    id: `printed-${index}`,
    object: new THREE.Mesh(geometry),
  }));
  const initial = snapshotShapes(objects);
  const cache = printReportsCache();
  let release: () => void = () => {};
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const analyze = vi.fn(async (instances: Instance[], faces?: Record<string, [number, number, number][]>) => {
    await barrier;

    return reportsFor(initial, instances, faces);
  });
  const first = cache(initial, undefined, analyze);

  objects[0].object.position.x = 37;

  const edited = snapshotShapes(objects);
  const second = cache(edited, undefined, analyze);

  expect(analyze).toHaveBeenCalledOnce();
  expect(analyze.mock.calls[0][0]).toHaveLength(1);
  release();

  const [a, b] = await Promise.all([first, second]);

  expect(a).toEqual(b);
  expect(Object.keys(b)).toEqual(objects.map(({ id }) => id));
  expect(b['printed-0'].check!.poses.length).toBeGreaterThan(0);
  a['printed-0'].check!.poses[0].down[0] = 99;
  expect(b['printed-0'].check!.poses[0].down[0]).not.toBe(99);
  expect(a['printed-1'].check!.poses[0].down[0]).not.toBe(99);

  const faces: Record<string, [number, number, number][]> = { 'printed-0': [[1, 1, 0]] };

  await cache(edited, faces, analyze);
  expect(analyze).toHaveBeenCalledTimes(2);
  expect(analyze.mock.calls[1][0].map(({ id }) => id)).toEqual(['printed-0']);

  geometry.scale(1, 1, 2);

  const versioned = snapshotShapes(objects);
  const versionedSend = vi.fn((instances: Instance[]) => reportsFor(versioned, instances));
  const resized = await cache(versioned, undefined, versionedSend);

  expect(versionedSend).toHaveBeenCalledOnce();
  expect(versionedSend.mock.calls[0][0]).toHaveLength(1);
  expect(resized['printed-0'].measure.volumeMm3).toBeCloseTo(b['printed-0'].measure.volumeMm3 * 2);

  const changedGeometry = new THREE.BoxGeometry(35, 10, 15);
  const changed = snapshotShapes([{ id: 'printed-0', object: new THREE.Mesh(changedGeometry) }]);
  const changedSend = vi.fn((instances: Instance[]) => reportsFor(changed, instances));
  const updated = await cache(changed, undefined, changedSend);

  expect(changedSend).toHaveBeenCalledOnce();
  expect(updated['printed-0'].measure.volumeMm3).not.toBe(b['printed-0'].measure.volumeMm3);
  geometry.dispose();
  changedGeometry.dispose();
});

it('releases failed entries and bounds completed reuse', async () => {
  const cache = printReportsCache(1);
  const objects = [1, 2].map((size) => ({
    id: `size-${size}`,
    object: new THREE.Mesh(new THREE.BoxGeometry(size, size, size)),
  }));
  const scenes = objects.map((object) => snapshotShapes([object]));
  const failed = vi.fn(async () => {
    throw new Error('prepare failed');
  });

  await expect(cache(scenes[0], undefined, failed)).rejects.toThrow('prepare failed');

  const analyze = vi.fn((instances: Instance[]) =>
    reportsFor(
      scenes.find((scene) => scene.instances[0].id === instances[0].id)!,
      instances,
    ),
  );

  await cache(scenes[0], undefined, analyze);
  await cache(scenes[1], undefined, analyze);
  await cache(scenes[0], undefined, analyze);
  expect(analyze).toHaveBeenCalledTimes(3);

  const lateCache = printReportsCache(1);
  let fail: (error: Error) => void = () => {};
  const stale = lateCache(
    scenes[0],
    undefined,
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  const rejected = expect(stale).rejects.toThrow('obsolete');

  await lateCache(scenes[1], undefined, analyze);
  await lateCache(scenes[0], undefined, analyze);
  fail(new Error('obsolete'));
  await rejected;
  await lateCache(scenes[0], undefined, analyze);
  expect(analyze).toHaveBeenCalledTimes(5);
  objects.forEach(({ object }) => object.geometry.dispose());
});
