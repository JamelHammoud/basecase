type Point = [number, number];

function pointLineDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);

  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));

  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function simplifyPolygon(points: Point[], epsilon: number): Point[] {
  if (points.length <= 4) return points;

  const out: Point[] = [];
  const appendRange = (start: number, end: number): void => {
    if (end - start <= 3) {
      for (let i = start; i < end; i++) out.push(points[i]);

      return;
    }

    let dmax = 0;
    let index = start;

    for (let i = start + 1; i < end; i++) {
      const dist = pointLineDistance(points[i], points[start], points[end]);

      if (dist > dmax) {
        index = i;
        dmax = dist;
      }
    }

    if (dmax <= epsilon) {
      out.push(points[start]);

      return;
    }

    appendRange(start, index);
    appendRange(index, end);
  };

  appendRange(0, points.length - 1);
  out.push(points[points.length - 1]);

  return out;
}
