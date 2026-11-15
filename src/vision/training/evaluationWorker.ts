import { workerClient } from '../../utils/workerRpc';
import { evaluationJobs } from './evaluationJobs';

export const evaluationWorker = workerClient<typeof evaluationJobs>(
  () => new Worker(new URL('./evaluation.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./evaluationJobs')).evaluationJobs,
);
