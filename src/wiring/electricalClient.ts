import { workerClient } from '../utils/workerRpc';
import type { ElectricalInput, ElectricalProjection } from './electricalTypes';

export type ElectricalInspection = Pick<ElectricalProjection, 'requirements' | 'powerBudget'>;
export interface SchematicResult {
  bytes: Uint8Array;
  sourceFingerprint: string;
}

type Handlers = {
  inspect: (input: ElectricalInput) => Promise<{ result: ElectricalInspection }>;
  build: (input: ElectricalInput) => Promise<{ result: SchematicResult }>;
};

async function localHandlers(): Promise<Handlers> {
  if (typeof document !== 'undefined') throw new Error('Schematic export needs a worker.');

  const { electricalProjection } = await import('./electrical');
  const { electricalPackage } = await import('./electricalPackage');

  return {
    inspect: async (input) => {
      const { requirements, powerBudget } = electricalProjection(input);

      return { result: { requirements, powerBudget } };
    },
    build: async (input) => {
      const { bytes, sourceFingerprint } = await electricalPackage(input);

      return { result: { bytes, sourceFingerprint } };
    },
  };
}

export function electricalClient() {
  return workerClient<Handlers>(
    () => new Worker(new URL('./electrical.worker.ts', import.meta.url), { type: 'module' }),
    localHandlers,
  );
}
