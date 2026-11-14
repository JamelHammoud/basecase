import type { MotionSkeleton } from '../utils/motionSkeleton';
import type { MotionFitRequest } from './motionFitOps';
import { workerClient } from '../utils/workerRpc';

const client = workerClient(
  () => new Worker(new URL('./motionFit.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./motionFitOps')).motionFitHandlers,
);

export const fitMotionInWorker = (request: MotionFitRequest): Promise<MotionSkeleton> => client.call('fit', request);
