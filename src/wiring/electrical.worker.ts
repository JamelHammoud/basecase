import { reply, serve } from '../utils/workerRpc';
import { inspectElectricalInput } from './electricalInspection';
import { timedBoardPlacement } from './boardPlacement';
import { defineBoard } from './boardDefinition';
import { boardPreview } from './boardPreview';
import { electricalPackage } from './electricalPackage';
import type { ElectricalInput } from './electricalTypes';

serve({
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
