import { workerClient } from '../utils/workerRpc';
import type { frameCameraJobs } from './frameCameraJobs';

const jobs = workerClient<typeof frameCameraJobs>(
  () => new Worker(new URL('./frameCamera.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./frameCameraJobs')).frameCameraJobs,
);

export const recordedFrameCameraKeys = (topics: Uint8Array | undefined) =>
  topics ? jobs.call('cameras', topics) : Promise.resolve([]);
