import { workerClient } from '../utils/workerRpc';
import { geometryHandlers } from './geometryOps';

export const geometryWorker = workerClient<typeof geometryHandlers>(
  () => new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' }),
  async () => geometryHandlers,
);
