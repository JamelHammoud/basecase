import type { LinkageSolution, Vec2 } from '../utils/linkage';
import { workerClient } from '../utils/workerRpc';

const client = workerClient(
  () => new Worker(new URL('./linkage.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./linkageOps')).linkageHandlers,
);

export const synthesizeInWorker = (points: Vec2[]): Promise<LinkageSolution[]> => client.call('synthesize', points);
