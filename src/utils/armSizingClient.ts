import type { ArmSizing, ArmSizingInput } from './armSizing';
import { workerClient } from './workerRpc';

const client = workerClient(
  () => new Worker(new URL('./armSizing.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./armSizingOps')).armSizingHandlers,
);

export const sizeArmInWorker = (input: ArmSizingInput): Promise<ArmSizing> => client.call('size', input);
