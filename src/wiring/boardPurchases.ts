import type { ElectronicsBoard } from './boardTypes';
import { boardProduct } from './boardProducts';
import { validBoardDefinition } from './boardValidation';

export function boardPurchases(board: ElectronicsBoard | undefined) {
  if (!board || !validBoardDefinition(board)) return [];

  const counts = new Map<string, number>();

  for (const placement of board.placements) {
    const catalogId = boardProduct(placement.productId)?.catalogId;

    if (catalogId) counts.set(catalogId, (counts.get(catalogId) ?? 0) + 1);
  }

  return [...counts].map(([id, qty]) => ({ key: `component:${id}`, qty, partIds: [board.partId] }));
}
