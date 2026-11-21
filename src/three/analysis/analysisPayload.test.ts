import * as THREE from 'three';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import type { AnalyzePayload } from './analysisOps';
import { floorIn } from './analysisPool';
import { snapshotShapes } from './sceneShapes';

const sent = vi.hoisted(() => {
  vi.stubGlobal('navigator', { hardwareConcurrency: 2 });

  return { payloads: [] as AnalyzePayload[], failNext: false };
});

vi.mock('../../utils/workerRpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/workerRpc')>()),
  workerClient: () => ({
    call: async (op: string, payload: AnalyzePayload) => {
      if (op !== 'analyze') return null;

      sent.payloads.push(payload);

      if (!sent.failNext) return null;

      sent.failNext = false;

      throw new Error('analysis: missing shape');
    },
  }),
}));

beforeEach(() => {
  sent.payloads.length = 0;
  sent.failNext = false;
});
afterAll(() => vi.unstubAllGlobals());

function repeatedScene(count: number) {
  const geometry = new THREE.BoxGeometry(20, 20, 20);
  const objects = Array.from({ length: count }, (_, i) => {
    const object = new THREE.Group();
    const mesh = new THREE.Mesh(geometry);

    mesh.position.x = i % 2;
    object.position.z = i * 30;
    object.add(mesh);

    return { id: `part-${i}`, object };
  });

  return { objects, scene: snapshotShapes(objects), geometry };
}

it.each([300, 600])('sends only missing shapes and shared geometry across %i instances', async (count) => {
  const { scene, objects, geometry } = repeatedScene(count);
  const source = geometry.attributes.position.array.slice();
  const keys = [...scene.shapes.keys()];
  const ids = [...scene.geometries.keys()];

  await floorIn(scene);
  await floorIn(scene);

  expect(sent.payloads.map((p) => p.shapes.map((s) => s.key))).toEqual([keys, []]);
  expect(sent.payloads.map((p) => p.geometries.map((g) => g.id))).toEqual([ids, []]);
  expect(sent.payloads.every((p) => p.task.instances === scene.instances)).toBe(true);
  expect(sent.payloads[0].geometries[0].positions).not.toBe(geometry.attributes.position.array);
  expect(geometry.attributes.position.array).toEqual(source);

  objects[0].object.children[0].position.y = 5;

  const moved = snapshotShapes(objects);

  await floorIn(moved);
  expect(sent.payloads[2].shapes.map((s) => s.key)).toEqual([moved.instances[0].key]);
  expect(sent.payloads[2].geometries).toEqual([]);

  geometry.translate(1, 0, 0);
  geometry.attributes.position.needsUpdate = true;

  const edited = snapshotShapes(objects);

  await floorIn(edited);
  expect(sent.payloads[3].shapes).toEqual([...edited.shapes.values()]);
  expect(sent.payloads[3].geometries.map((g) => g.id)).toEqual([...edited.geometries.keys()]);
});

it('resends complete deduplicated data after a worker loses its cache', async () => {
  const { scene } = repeatedScene(6);

  await floorIn(scene);
  sent.failNext = true;
  await floorIn(scene);

  expect(sent.payloads.map((p) => p.shapes.length)).toEqual([2, 0, 2]);
  expect(sent.payloads.map((p) => p.geometries.length)).toEqual([1, 0, 1]);
  expect(sent.payloads[2]).toEqual(sent.payloads[0]);
});
