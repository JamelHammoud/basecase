import type { BoardHole, ElectronicsBoard } from './boardTypes';
import type { ScenePart } from '../types/robotics';
import { boardProduct } from './boardProducts';
import { boardPoint } from './boardCoordinates';
import { boardRequirement } from './boardConstraints';

export function boardHoles(board: ElectronicsBoard): BoardHole[] {
  return [
    ...board.holes,
    ...board.placements.flatMap((placement) =>
      (boardProduct(placement.productId)?.mounting ?? []).map((hole) => ({
        ...hole,
        id: `${placement.id}:${hole.id}`,
        position: boardPoint(placement, hole.position, board.side),
      })),
    ),
  ];
}

export function boardDrills(board: ElectronicsBoard): BoardHole[] {
  return [
    ...boardHoles(board),
    ...board.placements.flatMap((placement) =>
      (boardProduct(placement.productId)?.pads ?? []).map((pad) => ({
        id: `${placement.id}:pad:${pad.number}`,
        position: boardPoint(placement, pad.position, board.side),
        diameterMm: pad.drillMm,
        keepoutMm: 0,
      })),
    ),
  ];
}

function outside(hole: BoardHole, part: ScenePart) {
  return (
    Math.abs(hole.position[0]) + hole.diameterMm / 2 >= part.dimensions.width / 2 ||
    Math.abs(hole.position[1]) + hole.diameterMm / 2 >= part.dimensions.depth / 2
  );
}

function overlaps(a: BoardHole, b: BoardHole) {
  return Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]) <= (a.diameterMm + b.diameterMm) / 2;
}

export function boardHoleFindings(board: ElectronicsBoard, part: ScenePart) {
  const holes = boardDrills(board);

  return holes.flatMap((hole, index) => {
    if (!outside(hole, part) && !holes.some((other, i) => i !== index && overlaps(hole, other))) return [];

    return [
      boardRequirement(
        board,
        'hole',
        `${hole.id}: keep the mounting hole inside the outline and clear of other holes.`,
      ),
    ];
  });
}
