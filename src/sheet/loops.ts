import type { Point2 } from './detect';

export type Edge2 = [Point2, Point2];

const KEY_MM = 1e-4;
const keyOf = (p: Point2) => `${Math.round(p[0] / KEY_MM)},${Math.round(p[1] / KEY_MM)}`;

function boundaryEdges(edges: Edge2[]): Map<string, { from: Point2; to: string }[]> {
  const counts = new Map<string, number>();

  for (const [a, b] of edges) {
    const ka = keyOf(a);
    const kb = keyOf(b);
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const next = new Map<string, { from: Point2; to: string }[]>();

  for (const [a, b] of edges) {
    const ka = keyOf(a);
    const kb = keyOf(b);

    if (ka === kb || counts.get(ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`) !== 1) continue;

    next.set(ka, [...(next.get(ka) ?? []), { from: a, to: kb }]);
  }

  return next;
}

function walk(start: string, next: Map<string, { from: Point2; to: string }[]>): Point2[] | null {
  const loop: Point2[] = [];
  const limit = next.size + 1;
  let at = start;

  for (let guard = 0; guard <= limit; guard++) {
    const outs = next.get(at);
    const step = outs?.pop();

    if (!step) return null;

    if (!outs!.length) next.delete(at);

    loop.push(step.from);
    at = step.to;

    if (at === start) return loop;
  }

  return null;
}

function straightAt(prev: Point2, p: Point2, nextP: Point2): boolean {
  const ax = p[0] - prev[0];
  const ay = p[1] - prev[1];
  const bx = nextP[0] - p[0];
  const by = nextP[1] - p[1];
  const span = Math.hypot(ax, ay) * Math.hypot(bx, by);

  return span > 0 && Math.abs(ax * by - ay * bx) <= span * 1e-7 && ax * bx + ay * by > 0;
}

export function withoutStraightPoints(loop: Point2[]): Point2[] {
  let points = loop;
  let changed = true;

  while (changed && points.length > 3) {
    const kept = points.filter(
      (p, i) => !straightAt(points[(i + points.length - 1) % points.length], p, points[(i + 1) % points.length]),
    );

    changed = kept.length !== points.length && kept.length >= 3;
    points = changed ? kept : points;
  }

  return points;
}

export function closedLoops(edges: Edge2[]): Point2[][] | null {
  const next = boundaryEdges(edges);
  const loops: Point2[][] = [];

  while (next.size) {
    const loop = walk(next.keys().next().value!, next);

    if (!loop || loop.length < 3) return null;

    loops.push(withoutStraightPoints(loop));
  }

  return loops;
}
