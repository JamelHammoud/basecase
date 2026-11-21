import type { PowerReplayRequest, PowerReplayRecord } from './powerReplayTypes';
import { KIT_MAX_BYTES } from '../kit/limits';
import type { ElectronicsBoard } from './boardTypes';
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
  inspectReplay: (
    input: ElectricalInput,
  ) => Promise<{ result: ReturnType<typeof import('./electricalInspection').inspectReplayInput> }>;
  replay: (input: PowerReplayRequest) => Promise<{ result: PowerReplayRecord }>;
  reopenReplay: (input: {
    record: PowerReplayRecord;
    current: ElectricalInput;
    baseline?: PowerReplayRecord;
  }) => Promise<{ result: { applicable: boolean; result: PowerReplayRecord['result'] } }>;
  kit: (
    input: Parameters<typeof import('../kit/electrical').electricalKitFiles>[0],
  ) => Promise<{ result: import('../kit/electrical').KitElectrical }>;

  acceptRoute: (
    input: Parameters<typeof import('./boardRouteAcceptance').acceptBoardRoute>[0],
  ) => Promise<{ result: ElectronicsBoard }>;
  importText: (
    input: Parameters<typeof import('./boardRoutedSource').importRoutedText>[0],
  ) => Promise<{ result: ElectronicsBoard }>;

  prepareRoute: (
    input: ElectricalInput,
  ) => Promise<{ result: Awaited<ReturnType<typeof import('./boardRoutePreparation').prepareBoardRoute>> }>;
  importBoard: (
    input: Parameters<typeof import('./boardRoutedSource').importRoutedSource>[0],
  ) => Promise<{ result: Awaited<ReturnType<typeof import('./boardRoutedSource').importRoutedSource>> }>;
  prepareKit: (input: ElectricalInput) => Promise<{ result: import('./boardRoutingPackage').PreparedBoardExport }>;
  prepareExport: (input: ElectricalInput) => Promise<{ result: import('./boardRoutingPackage').PreparedBoardExport }>;
  finishExport: (
    input: Parameters<typeof import('./boardExportPreparation').finishBoardExport>[0],
  ) => Promise<{ result: SchematicResult }>;
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

  const { retainPowerReplay, reopenPowerReplay } = await import('./powerReplayRecord');
  const { acceptBoardRoute } = await import('./boardRouteAcceptance');
  const { importRoutedSource, importRoutedText } = await import('./boardRoutedSource');
  const { prepareBoardRoute } = await import('./boardRoutePreparation');
  const { prepareBoardExport, finishBoardExport } = await import('./boardExportPreparation');
  const { inspectElectricalInput, inspectReplayInput } = await import('./electricalInspection');
  const { timedBoardPlacement } = await import('./boardPlacement');
  const { defineBoard } = await import('./boardDefinition');
  const { boardPreview } = await import('./boardPreview');
  const { electricalKitFiles } = await import('../kit/electrical');
  const { electricalPackage } = await import('./electricalPackage');

  return {
    inspectReplay: async (input) => ({ result: inspectReplayInput(input) }),
    replay: async (input) => ({ result: await retainPowerReplay(input) }),
    reopenReplay: async (input) => ({ result: await reopenPowerReplay(input.record, input.current, input.baseline) }),
    kit: async (input) => ({ result: await electricalKitFiles(input) }),
    acceptRoute: async (input) => ({ result: await acceptBoardRoute(input) }),
    importText: async (input) => ({ result: await importRoutedText(input) }),
    prepareRoute: async (input) => ({ result: await prepareBoardRoute(input) }),
    importBoard: async (input) => ({ result: await importRoutedSource(input) }),
    prepareKit: async (input) => ({ result: await prepareBoardExport(input, KIT_MAX_BYTES) }),
    prepareExport: async (input) => ({ result: await prepareBoardExport(input) }),
    finishExport: async (input) => ({ result: await finishBoardExport(input) }),
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
