import { workerClient } from '../utils/workerRpc';
import type { MotionDesignRequest } from './motionDesign';

const client = workerClient(
  () => new Worker(new URL('./motionSkeleton.worker.ts', import.meta.url), { type: 'module' }),
  async () => {
    if (typeof window !== 'undefined') throw new Error('Motion fitting worker is unavailable.');

    return (await import('./motionSkeletonOps')).motionSkeletonHandlers;
  },
);

export const designMotionInWorker = (request: MotionDesignRequest) => client.call('design', request);
