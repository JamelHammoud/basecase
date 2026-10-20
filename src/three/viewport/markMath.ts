export type Point2 = [number, number];

export const MIN_STROKE_PX = 8;
export const SAMPLE_PX = 2.5;
export const MAX_MARK_POINTS = 400;

export function strokeLength(points: Point2[]): number {
  let length = 0;

  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }

  return length;
}

function distanceToSegment([px, py]: Point2, [ax, ay]: Point2, [bx, by]: Point2): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distanceToPolyline(point: Point2, polyline: Point2[]): number {
  let best = Infinity;

  for (let i = 1; i < polyline.length; i++) {
    best = Math.min(best, distanceToSegment(point, polyline[i - 1], polyline[i]));
  }

  return best;
}

export function viewAngles([x, y, z]: [number, number, number]): string {
  const length = Math.hypot(x, y, z) || 1;
  const az = Math.round((Math.atan2(x, z) * 180) / Math.PI);
  const el = Math.round((Math.asin(y / length) * 180) / Math.PI);

  return `az:${az},el:${el}`;
}

export function pointInPolygon([x, y]: Point2, polygon: Point2[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (crosses) inside = !inside;
  }

  return inside;
}

export function polygonArea(polygon: Point2[]): number {
  let twice = 0;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    twice += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
  }

  return Math.abs(twice) / 2;
}

export function thinned<T>(points: T[], max = MAX_MARK_POINTS): T[] {
  if (points.length <= max) return points;

  const step = (points.length - 1) / (max - 1);

  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

export function encloses(stroke: Point2[]): boolean {
  if (stroke.length < 3) return false;

  const length = strokeLength(stroke);
  const [first, last] = [stroke[0], stroke[stroke.length - 1]];
  const gap = Math.hypot(first[0] - last[0], first[1] - last[1]);

  return gap < length * 0.35 && polygonArea(stroke) > (length * length) / 200;
}
