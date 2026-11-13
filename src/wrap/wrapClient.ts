import { copyGeometries, type SceneShapes } from '../three/analysis/sceneShapes';
import { workerClient } from '../utils/workerRpc';
import type { WrapPayload } from './wrapOps';
import type { WrapResult } from './wrapTypes';

const client = workerClient(
  () => new Worker(new URL('./wrap.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./wrapOps')).wrapHandlers,
);

export type WrapRequest = Omit<WrapPayload, 'geometries' | 'shapes' | 'instances'>;

export async function wrapInWorker(scene: SceneShapes, request: WrapRequest): Promise<WrapResult> {
  const geometries = await copyGeometries(scene, [...scene.geometries.keys()]);

  return client.call(
    'wrap',
    { ...request, geometries, shapes: [...scene.shapes.values()], instances: scene.instances },
    geometries.flatMap((g) => [g.positions.buffer, ...(g.index ? [g.index.buffer] : [])]),
  );
}
