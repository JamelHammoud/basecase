import type { ArmRequest, ArmSizing } from '../utils/armSizing';
import { workerClient } from '../utils/workerRpc';

const client = workerClient(
  () => new Worker(new URL('./armSizing.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./armSizingOps')).armSizingHandlers,
);

export const sizeArmInWorker = (request: ArmRequest): Promise<ArmSizing> => client.call('size', request);
