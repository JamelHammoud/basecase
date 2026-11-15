import { workerClient } from '../utils/workerRpc';
import type { RepairInput } from './repairOps';

const client = workerClient(
  () => new Worker(new URL('./repair.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./repairOps')).repairHandlers,
);

export const repairInWorker = (input: RepairInput) => client.call('plan', input);
