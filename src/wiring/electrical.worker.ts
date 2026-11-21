import { KIT_MAX_BYTES } from '../kit/limits';
import { electricalKitFiles } from '../kit/electrical';
import { acceptBoardRoute } from './boardRouteAcceptance';
import { prepareBoardRoute } from './boardRoutePreparation';
import { importRoutedSource, importRoutedText } from './boardRoutedSource';
import { prepareBoardExport, finishBoardExport } from './boardExportPreparation';
import { reply, serve } from '../utils/workerRpc';
import { inspectElectricalInput } from './electricalInspection';
import { timedBoardPlacement } from './boardPlacement';
import { defineBoard } from './boardDefinition';
import { boardPreview } from './boardPreview';
import { electricalPackage } from './electricalPackage';
import type { ElectricalInput } from './electricalTypes';

serve({
  kit: async (input: Parameters<typeof electricalKitFiles>[0]) => {
    const result = await electricalKitFiles(input);

    return reply(
      result,
      Object.values(result.files).map((bytes) => bytes.buffer),
    );
  },
  acceptRoute: async (input: Parameters<typeof acceptBoardRoute>[0]) => reply(await acceptBoardRoute(input)),
  importText: async (input: Parameters<typeof importRoutedText>[0]) => reply(await importRoutedText(input)),
  prepareRoute: async (input: ElectricalInput) => reply(await prepareBoardRoute(input)),
  importBoard: async (input: Parameters<typeof importRoutedSource>[0]) => reply(await importRoutedSource(input)),
  prepareKit: async (input: ElectricalInput) => reply(await prepareBoardExport(input, KIT_MAX_BYTES)),
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
