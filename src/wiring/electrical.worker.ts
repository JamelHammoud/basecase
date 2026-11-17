import { importRoutedSource } from './boardRoutedSource';
import { prepareBoardExport, finishBoardExport } from './boardExportPreparation';
import { reply, serve } from '../utils/workerRpc';
import { inspectElectricalInput } from './electricalInspection';
import { timedBoardPlacement } from './boardPlacement';
import { defineBoard } from './boardDefinition';
import { boardPreview } from './boardPreview';
import { electricalPackage } from './electricalPackage';
import type { ElectricalInput } from './electricalTypes';

serve({
  importBoard: async (input: Parameters<typeof importRoutedSource>[0]) => reply(await importRoutedSource(input)),
  prepareExport: async (input: ElectricalInput) => reply(await prepareBoardExport(input)),
  finishExport: async (input: Parameters<typeof finishBoardExport>[0]) => {
    const { bytes, sourceFingerprint } = await finishBoardExport(input);

    return reply({ bytes, sourceFingerprint }, [bytes.buffer]);
  },
  preview: (input: Parameters<typeof boardPreview>[0]) => {
    const result = boardPreview(input);

    return reply(result, [result.positions.buffer, result.indices.buffer]);
  },
  define: (input: ElectricalInput & { boardId: string }) => reply(defineBoard(input, input.boardId)),
  inspect: async (input: ElectricalInput) => reply(await inspectElectricalInput(input)),
  place: (input: ElectricalInput) => reply(timedBoardPlacement(input)),
  build: async (input: ElectricalInput) => {
    const { bytes, sourceFingerprint } = await electricalPackage(input);

    return reply({ bytes, sourceFingerprint }, [bytes.buffer]);
  },
});
