import { workerClient } from '../utils/workerRpc';
import type { snapshotJobs } from './snapshotJobs';

export const snapshotWorker = workerClient<typeof snapshotJobs>(
  () => new Worker(new URL('./snapshot.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./snapshotJobs')).snapshotJobs,
);

export const encodeJson = (value: unknown): Promise<Uint8Array> => snapshotWorker.call('encodeJson', value);

export const decodeJson = (bytes: Uint8Array): Promise<unknown> => snapshotWorker.call('decodeJson', bytes);
