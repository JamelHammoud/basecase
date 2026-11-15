import { workerClient } from '../utils/workerRpc';
import type { imageDatasetJobs } from './imageDatasetJobs';

export const imageDatasetWorker = workerClient<typeof imageDatasetJobs>(
  () => new Worker(new URL('./imageDataset.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./imageDatasetJobs')).imageDatasetJobs,
);
