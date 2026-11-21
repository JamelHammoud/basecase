import { workerClient } from '../utils/workerRpc';
import { TRY_FILE_ERROR, type tryArchiveJobs } from './tryArchiveJobs';

export const tryArchiveWorker = workerClient<typeof tryArchiveJobs>(
  () => new Worker(new URL('./tryArchive.worker.ts', import.meta.url), { type: 'module' }),
  async () => {
    if (typeof window !== 'undefined') throw new Error(TRY_FILE_ERROR);

    return (await import('./tryArchiveJobs')).tryArchiveJobs;
  },
);
