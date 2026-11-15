import { readFile } from 'node:fs/promises';
import { Group } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { component, sceneOf } from '../../wiring/fixtures';
import { platformBridge } from '../../utils/platformBridge';
import { forgetComponentMesh, provideMeshFiles } from '../componentMeshes';
import { wiringSnapshot } from './analysisSnapshots';
import type { ViewportContext } from './viewportContext';

const ids = ['robotis-u2d2', 'dynamixel-xl330-m288'];

afterEach(() => {
  ids.forEach(forgetComponentMesh);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('refuses missing models before snapshotting and measures again after their geometry loads', async () => {
  const adapter = component('adapter', ids[0]);
  const servo = { ...component('servo', ids[1]), position: [70, 0, 0] as [number, number, number] };
  const scene = sceneOf([adapter, servo], []);
  const snapshot = vi.fn((run: () => unknown) => run());
  const complete = vi.fn();
  let currentParts = scene.parts;
  const ctx = {
    props: () => ({ parts: currentParts }),
    layer: { withRest: snapshot },
    stage: { partsRoot: new Group() },
    applyPose: vi.fn(),
  } as unknown as ViewportContext;
  const measure = () => wiringSnapshot(scene, ctx, complete);

  vi.spyOn(platformBridge, 'listSourced').mockResolvedValue([]);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 404 })),
  );
  await expect(measure()).rejects.toThrow('Couldn’t load the robotis-u2d2 model (404).');
  expect(snapshot).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();

  const files = await Promise.all(
    ids.map(async (id) => {
      const bytes = await readFile(new URL(`../../../public/parts/${id}.glb`, import.meta.url));

      return [id, Uint8Array.from(bytes).buffer] as const;
    }),
  );

  provideMeshFiles(Object.fromEntries(files));

  const measured = await measure();

  expect(measured.buses[0].nets[0].route?.status).toBe('pass');
  expect(snapshot).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledOnce();

  snapshot.mockClear();

  currentParts = [...scene.parts, { ...adapter, id: 'drilled-operand', role: 'reference' }];
  expect((await measure()).buses[0].nets[0].route?.status).toBe('pass');
  snapshot.mockClear();
  complete.mockClear();

  const pending = measure();

  currentParts = [adapter, { ...servo, position: [170, 0, 0] }];
  await expect(pending).rejects.toThrow('Open the scene to measure cable routes.');
  expect(snapshot).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});
