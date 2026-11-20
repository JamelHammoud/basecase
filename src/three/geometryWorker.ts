import { workerClient } from '../utils/workerRpc';
import type { geometryHandlers } from './geometryOps';

export const geometryWorker = workerClient<typeof geometryHandlers>(
  () => new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./geometryOps')).geometryHandlers,
);

export function isolatedGeometryWorker() {
  return workerClient<typeof geometryHandlers>(
    () => new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' }),
    async () => {
      throw new Error('Geometry needs a worker.');
    },
  );
}
