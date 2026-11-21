import type { Point2 } from '../data/printers';
import type { Rect } from './bed';

export function polygonBounds(points: readonly Point2[]): Rect {
  let x = Infinity;
  let y = Infinity;
  let right = -Infinity;
  let top = -Infinity;

  for (const [px, py] of points) {
    x = Math.min(x, px);
    y = Math.min(y, py);
    right = Math.max(right, px);
    top = Math.max(top, py);
  }

  return { x, y, w: right - x, d: top - y };
}
