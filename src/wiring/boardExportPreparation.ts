import { electricalSources, electricalArchive } from './electricalPackage';
import { finishBoardFiles, nativeBoardRequest, type PreparedBoardExport } from './boardRoutingPackage';
import type { ElectricalInput } from './electricalTypes';
import type { BoardNativeResult } from './boardRoutingTypes';

export async function prepareBoardExport(input: ElectricalInput, maxBytes = Infinity): Promise<PreparedBoardExport> {
  const prepared = await electricalSources(input, maxBytes);

  return {
    files: prepared.files,
    sourceFingerprint: prepared.sourceFingerprint,
    request: await nativeBoardRequest(prepared, input.project.electronicsBoard?.routed),
  };
}

export async function finishBoardExport(input: { prepared: PreparedBoardExport; result: BoardNativeResult | null }) {
  const files = await finishBoardFiles(input.prepared, input.result);

  return electricalArchive(files, input.prepared.sourceFingerprint);
}
