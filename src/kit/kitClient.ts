import { workerClient } from '../utils/workerRpc';
import type { KitJob } from './types';

type KitHandlers = { build: (job: KitJob) => Promise<{ result: Uint8Array }> };

const localHandlers = async (): Promise<KitHandlers> => {
  if (typeof document !== 'undefined') throw new Error('Kit export needs a worker.');

  const { buildKit } = await import('./buildKit');

  return { build: async (job) => ({ result: buildKit(job) }) };
};

export function kitClient() {
  return workerClient<KitHandlers>(
    () => new Worker(new URL('./kit.worker.ts', import.meta.url), { type: 'module' }),
    localHandlers,
  );
}
