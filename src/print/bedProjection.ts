import type { Point2 } from '../data/printers';

interface Axis {
  x: number;
  y: number;
  low: number;
  high: number;
  ready: boolean;
}

interface Projection {
  points: Point2[];
  axes: Axis[];
}

const EPS = 1e-6;

export function bedProjection(points: Point2[]): Projection {
  const axes = points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    const x = q[1] - p[1];
    const y = p[0] - q[0];

    return { x, y, low: Infinity, high: -Infinity, ready: false };
  });

  return { points, axes };
}

function prepareAxis(points: Point2[], axis: Axis) {
  if (axis.ready) return;

  for (const point of points) {
    const value = point[0] * axis.x + point[1] * axis.y;

    axis.low = Math.min(axis.low, value);
    axis.high = Math.max(axis.high, value);
  }

  axis.ready = true;
}

function separatedOn(source: Point2[], points: Point2[], axis: Axis): boolean {
  prepareAxis(source, axis);

  let low = Infinity;
  let high = -Infinity;

  for (const point of points) {
    const value = point[0] * axis.x + point[1] * axis.y;

    low = Math.min(low, value);
    high = Math.max(high, value);
  }

  return axis.high <= low + EPS || high <= axis.low + EPS;
}

export const bedSeparated = (a: Projection, b: Projection): boolean =>
  a.axes.some((axis) => separatedOn(a.points, b.points, axis)) ||
  b.axes.some((axis) => separatedOn(b.points, a.points, axis));
