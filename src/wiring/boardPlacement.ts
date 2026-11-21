import type { ElectricalInput } from './electricalTypes';
import type { BoardKeepout, BoardPlacement, BoardProduct, ElectronicsBoard } from './boardTypes';
import type { ScenePart } from '../types/robotics';
import { boardProduct } from './boardProducts';
import { placementConstraints } from './boardConstraints';
import { placedArea } from './boardCoordinates';
import { projectBoard } from './boardProjection';
import { boardPlacements } from './boardCandidates';
import { compareElectricalIds } from './electricalSource';

interface PlacementSearch {
  board: ElectronicsBoard;
  part: ScenePart;
  occupied: BoardKeepout[];
  budget: { remaining: number; attempts: number };
}

function findPlacement(item: BoardPlacement, product: BoardProduct, search: PlacementSearch) {
  const { board, part, occupied, budget } = search;
  const { width, depth } = part.dimensions;

  for (let z = -depth / 2; z <= depth / 2 && budget.remaining > 0; z += 1) {
    for (let x = -width / 2; x <= width / 2 && budget.remaining > 0; x += 1) {
      const candidate = { ...item, position: [x, z] as [number, number] };

      budget.remaining--;
      budget.attempts++;

      if (!placementConstraints({ board, part, placement: candidate, product, occupied }).length) return candidate;
    }
  }

  return null;
}

export function placeBoard(input: ElectricalInput, options: { maxCandidates?: number } = {}) {
  const original = projectBoard(input);
  const board = structuredClone(original.board);
  const budget = { remaining: Math.floor(Math.min(50_000, Math.max(0, options.maxCandidates ?? 50_000))), attempts: 0 };
  const occupied = board.placements.flatMap((placement) => {
    const product = boardProduct(placement.productId);

    return placement.locked && product ? [placedArea(placement, product.courtyard, board.side)] : [];
  });
  const sorted = [...board.placements].sort((a, b) => compareElectricalIds(a.id, b.id));

  for (const item of sorted) {
    const product = boardProduct(item.productId);

    if (item.locked || !product || !original.part) continue;

    const placed = findPlacement(item, product, { board, part: original.part, occupied, budget });

    if (!placed) {
      item.unplaced = true;

      continue;
    }

    board.placements[board.placements.indexOf(item)] = { ...placed, unplaced: false };
    occupied.push(placedArea(placed, product.courtyard, board.side));
  }

  const result = projectBoard({ ...input, project: { ...input.project, electronicsBoard: board } });

  return { ...result, attempts: budget.attempts };
}

export function timedBoardPlacement(input: ElectricalInput) {
  const start = performance.now();
  const original = projectBoard(input);
  const covered = new Set(original.board.placements.flatMap((item) => item.bindings.map((binding) => binding.partId)));
  const added = boardPlacements(input).filter((item) => !item.bindings.some((binding) => covered.has(binding.partId)));
  const board = { ...original.board, placements: [...original.board.placements, ...added] };
  const result = placeBoard({ ...input, project: { ...input.project, electronicsBoard: board } });

  return { ...result, durationMs: performance.now() - start };
}
