import type { Box, Point } from './types';

export const centre = (box: Box): Point => [box[0] + box[2] / 2, box[1] + box[3] / 2];

export function overlapRatio(a: Box, b: Box) {
  const width = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const height = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);

  if (width <= 0 || height <= 0) return 0;

  const area = width * height;

  return area / Math.max(1e-12, a[2] * a[3] + b[2] * b[3] - area);
}

export function insidePolygon(point: Point, polygon: readonly Point[]) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;

    if (crosses) inside = !inside;
  }

  return inside;
}

export function sideOf(point: Point, from: Point, to: Point) {
  const normalX = -(to[1] - from[1]);
  const normalY = to[0] - from[0];
  const length = Math.hypot(normalX, normalY) || 1;

  return ((point[0] - from[0]) * normalX + (point[1] - from[1]) * normalY) / length;
}

export function segmentsMeet(a: Point, b: Point, c: Point, d: Point) {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const denominator = rx * sy - ry * sx;

  if (Math.abs(denominator) < 1e-12) return false;

  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denominator;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denominator;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
