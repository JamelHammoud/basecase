import type { MotionDesignResult } from '../utils/motionDesign';
import { workerClient } from '../utils/workerRpc';
import type { MotionDesignCall } from './motionDesignOps';

const client = workerClient(
  () => new Worker(new URL('./motionDesign.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./motionDesignOps')).motionDesignHandlers,
);

export const designInWorker = (call: MotionDesignCall): Promise<MotionDesignResult> => client.call('design', call);
