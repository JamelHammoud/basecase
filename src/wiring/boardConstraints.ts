import type { BoardKeepout, BoardPlacement, BoardProduct, ElectronicsBoard } from './boardTypes';
import type { ElectricalRequirement } from './electricalTypes';
import type { ScenePart } from '../types/robotics';
import { boardProduct } from './boardProducts';
import { placedArea } from './boardCoordinates';

export const boardRequirement = (board: ElectronicsBoard, code: string, detail: string): ElectricalRequirement => ({
  code: `board-${code}`,
  partIds: [board.partId],
  references: [],
  detail,
});

export function areasOverlap(a: BoardKeepout, b: BoardKeepout) {
  return a.min[0] < b.max[0] && b.min[0] < a.max[0] && a.min[1] < b.max[1] && b.min[1] < a.max[1];
}

function conflictsWithHole(area: BoardKeepout, board: ElectronicsBoard) {
  return board.holes.some((hole) => {
    const x = Math.max(area.min[0], Math.min(hole.position[0], area.max[0]));
    const y = Math.max(area.min[1], Math.min(hole.position[1], area.max[1]));

    return Math.hypot(x - hole.position[0], y - hole.position[1]) < hole.diameterMm / 2 + hole.keepoutMm;
  });
}

function exceedsOutline(area: BoardKeepout, part: ScenePart, clearance: number) {
  const { width, depth } = part.dimensions;

  return (
    area.min[0] < -width / 2 + clearance ||
    area.max[0] > width / 2 - clearance ||
    area.min[1] < -depth / 2 + clearance ||
    area.max[1] > depth / 2 - clearance
  );
}

export interface BoardConstraintInput {
  board: ElectronicsBoard;
  part: ScenePart;
  placement: BoardPlacement;
  product: BoardProduct;
  occupied: BoardKeepout[];
}

export function placementConstraints({ board, part, placement, product, occupied }: BoardConstraintInput) {
  const courtyard = placedArea(placement, product.courtyard, board.side);
  const access = placedArea(placement, product.access, board.side);
  const otherSide = board.side === 'top' ? 'bottom' : 'top';
  const findings: ElectricalRequirement[] = [];
  const add = (code: string, detail: string) => findings.push(boardRequirement(board, code, detail));

  if (exceedsOutline(courtyard, part, board.edgeClearanceMm))
    add('outline', `${placement.id}: move the component inside the board outline.`);

  if (conflictsWithHole(courtyard, board))
    add('hole', `${placement.id}: move the component clear of the mounting hole.`);

  if (occupied.some((area) => area.id !== placement.id && areasOverlap(courtyard, area)))
    add('overlap', `${placement.id}: separate the component courtyards.`);

  if (product.access.heightMm > board.heightMm[board.side] || board.keepouts.some((area) => areasOverlap(access, area)))
    add('access', `${placement.id}: leave room to insert and remove the plug.`);

  if (product.heightMm > board.heightMm[board.side] || product.belowMm > board.heightMm[otherSide])
    add('height', `${placement.id}: leave room above and below the board.`);

  if (part.dimensions.height < product.boardThicknessMm[0] || part.dimensions.height > product.boardThicknessMm[1])
    add('thickness', `${placement.id}: use a board thickness supported by the connector.`);

  return findings;
}

export function boardConstraints(board: ElectronicsBoard, part: ScenePart) {
  const known = board.placements.flatMap((placement) => {
    const product = boardProduct(placement.productId);

    return product ? [{ placement, product }] : [];
  });
  const occupied = known.map(({ placement, product }) => placedArea(placement, product.courtyard, board.side));

  return known.flatMap(({ placement, product }) => placementConstraints({ board, part, placement, product, occupied }));
}
