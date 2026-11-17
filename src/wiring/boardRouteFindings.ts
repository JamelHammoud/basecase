import { checkedRoutePlan } from './boardRouteContract.mjs';
import { boardImportMessage } from './boardRoutingFindings';
import type { ElectronicsBoard } from './boardTypes';
import type { ElectricalRequirement } from './electricalTypes';

export function boardRouteFindings(board: ElectronicsBoard): ElectricalRequirement[] {
  if (!board.routing) return [];

  try {
    checkedRoutePlan(board.routing, board.routed?.rules ?? board.fabrication ?? null);

    return [];
  } catch (error) {
    const code = error instanceof Error ? error.message : 'board-route-requirements';

    return [{ code, detail: boardImportMessage(code), partIds: [board.partId], references: [] }];
  }
}
