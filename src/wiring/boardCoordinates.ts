import type { BoardKeepout, BoardPlacement, BoardPoint, ElectronicsBoard } from './boardTypes';

export function boardPoint(placement: BoardPlacement, point: BoardPoint, side: ElectronicsBoard['side']): BoardPoint {
  const [x, localZ] = point;
  const z = side === 'top' ? localZ : -localZ;
  const turns: Record<BoardPlacement['rotation'], BoardPoint> = {
    0: [x, z],
    90: [-z, x],
    180: [-x, -z],
    270: [z, -x],
  };
  const [turnedX, turnedZ] = turns[placement.rotation];

  return [turnedX + placement.position[0], turnedZ + placement.position[1]];
}

export function placedArea(
  placement: BoardPlacement,
  area: { min: BoardPoint; max: BoardPoint },
  side: ElectronicsBoard['side'],
): BoardKeepout {
  const a = boardPoint(placement, area.min, side);
  const b = boardPoint(placement, area.max, side);

  return {
    id: placement.id,
    min: [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
    max: [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
  };
}
