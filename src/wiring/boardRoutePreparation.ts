import { electricalPackage } from './electricalPackage';
import { nativeBoardRequest } from './boardRoutingPackage';
import { boardDigest } from './boardNativeContract.mjs';
import { checkedRoutePlan } from './boardRouteContract.mjs';
import { boardImportMessage } from './boardRoutingFindings';
import type { ElectricalInput } from './electricalTypes';

export async function prepareBoardRoute(input: ElectricalInput) {
  const board = input.project.electronicsBoard;

  if (!board) throw new Error(boardImportMessage('board-route-layout'));

  if (board.routed) throw new Error(boardImportMessage('board-route-copper'));

  const rules = board.fabrication ?? null;

  try {
    checkedRoutePlan(board.routing, rules);
  } catch (error) {
    throw new Error(boardImportMessage(error instanceof Error ? error.message : 'board-route-requirements'), {
      cause: error,
    });
  }

  const prepared = await electricalPackage(input);
  const pcb = prepared.files['robot.kicad_pcb'];

  if (!pcb) throw new Error(boardImportMessage('board-route-layout'));

  prepared.files['current-unrouted.kicad_pcb'] = pcb;

  const request = await nativeBoardRequest(prepared, {
    schema: 1,
    pcb,
    hash: await boardDigest(pcb),
    sourceFingerprint: prepared.sourceFingerprint,
    rules,
  });

  if (!request) throw new Error(boardImportMessage('board-source'));

  return { request, plan: board.routing! };
}
