import { workerClient } from '../utils/workerRpc';
import type { buildRepairHandlers } from './buildRepairOps';
import type { PreparedFrozenKit } from './frozenContent';

export async function prepareBuildRepair(source: PreparedFrozenKit, target: PreparedFrozenKit, signal: AbortSignal) {
  signal.throwIfAborted();

  const client = workerClient<typeof buildRepairHandlers>(
    () => new Worker(new URL('./buildRepair.worker.ts', import.meta.url), { type: 'module' }),
    async () => {
      signal.throwIfAborted();

      if (typeof document !== 'undefined') throw new Error('Repair needs a worker.');

      return (await import('./buildRepairOps')).buildRepairHandlers;
    },
  );

  signal.addEventListener('abort', client.dispose, { once: true });

  try {
    const result = await client.call('prepare', { source, target });

    signal.throwIfAborted();

    return result;
  } catch (error) {
    signal.throwIfAborted();

    throw error;
  } finally {
    signal.removeEventListener('abort', client.dispose);
    client.dispose();
  }
}
