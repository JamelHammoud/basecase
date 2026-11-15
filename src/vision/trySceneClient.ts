import { workerClient } from '../utils/workerRpc';
import type { TrySceneInput, trySceneJobs } from './trySceneJobs';

const jobs = workerClient<typeof trySceneJobs>(
  () => new Worker(new URL('./tryScene.worker.ts', import.meta.url), { type: 'module' }),
  async () => {
    if (typeof document !== 'undefined') throw new Error('The frame label scene worker could not start.');

    return (await import('./trySceneJobs')).trySceneJobs;
  },
);

export const buildTryScene = (input: TrySceneInput) => jobs.call('build', input);
