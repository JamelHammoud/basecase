import { electricalPackage } from './electricalPackage';
import { reconcileRoutedBoard } from './boardReconcile.mjs';
import { KICAD_BOARD_LIMITS } from './boardKiCad.mjs';
import { boardDigest } from './boardNativeContract.mjs';
import { routingInput } from './boardRoutingRecord';
import { boardImportMessage } from './boardRoutingFindings';
import type { ElectronicsBoard } from './boardTypes';
import type { ElectricalInput } from './electricalTypes';

export { routingInput } from './boardRoutingRecord';

export async function importRoutedSource({
  input,
  bytes,
}: {
  input: ElectricalInput;
  bytes: Uint8Array<ArrayBuffer>;
}): Promise<ElectronicsBoard> {
  if (typeof document !== 'undefined') throw new Error('Board import needs a worker.');

  if (bytes.byteLength > KICAD_BOARD_LIMITS.bytes) throw new Error(boardImportMessage('board-format'));

  const pcb = routedText(bytes);
  const base = await electricalPackage(routingInput(input));
  const board = input.project.electronicsBoard;

  if (!board) throw new Error('Board definition is required.');

  const comparison = reconcileRoutedBoard({
    expected: base.files['robot.kicad_pcb'],
    imported: pcb,
    sourceFingerprint: base.sourceFingerprint,
  });

  if (!comparison.accepted) throw new Error(boardImportMessage(comparison.code));

  return {
    ...board,
    routed: {
      schema: 1 as const,
      pcb,
      hash: await boardDigest(bytes),
      sourceFingerprint: base.sourceFingerprint,
      rules: board.routed?.rules ?? board.fabrication ?? null,
    },
  };
}

function routedText(bytes: Uint8Array<ArrayBuffer>) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(boardImportMessage('board-format'));
  }
}

export function importRoutedText(input: { input: ElectricalInput; pcb: string }) {
  return importRoutedSource({ input: input.input, bytes: new TextEncoder().encode(input.pcb) });
}
