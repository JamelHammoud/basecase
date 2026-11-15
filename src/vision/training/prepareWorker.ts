import { workerClient } from '../../utils/workerRpc';
import type { preparationJobs } from './prepareJobs';

export const preparationWorker = workerClient<typeof preparationJobs>(
  () => new Worker(new URL('./prepare.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./prepareJobs')).preparationJobs,
);
