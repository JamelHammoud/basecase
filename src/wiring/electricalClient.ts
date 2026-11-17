import { workerClient } from '../utils/workerRpc';
import type { ElectricalInput, ElectricalProjection } from './electricalTypes';

export type ElectricalInspection = Pick<ElectricalProjection, 'requirements' | 'powerBudget'> & {
  board?: boolean;
  metrics?: { geometryMs: number; geometryBytes: number };
};
export interface SchematicResult {
  bytes: Uint8Array;
  sourceFingerprint: string;
}

type Handlers = {
  preview: (
    input: Parameters<typeof import('./boardPreview').boardPreview>[0],
  ) => Promise<{ result: ReturnType<typeof import('./boardPreview').boardPreview> }>;
  define: (
    input: ElectricalInput & { boardId: string },
  ) => Promise<{ result: ReturnType<typeof import('./boardDefinition').defineBoard> }>;
  place: (
    input: ElectricalInput,
  ) => Promise<{ result: ReturnType<typeof import('./boardPlacement').timedBoardPlacement> }>;
  inspect: (input: ElectricalInput) => Promise<{ result: ElectricalInspection }>;
  build: (input: ElectricalInput) => Promise<{ result: SchematicResult }>;
};

async function localHandlers(): Promise<Handlers> {
  if (typeof document !== 'undefined') throw new Error('Schematic export needs a worker.');

  const { inspectElectricalInput } = await import('./electricalInspection');
  const { timedBoardPlacement } = await import('./boardPlacement');
  const { defineBoard } = await import('./boardDefinition');
  const { boardPreview } = await import('./boardPreview');
  const { electricalPackage } = await import('./electricalPackage');

  return {
    preview: async (input) => ({ result: boardPreview(input) }),
    define: async (input) => ({ result: defineBoard(input, input.boardId) }),
    inspect: async (input) => ({ result: await inspectElectricalInput(input) }),
    place: async (input) => ({ result: timedBoardPlacement(input) }),
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
