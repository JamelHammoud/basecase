import type { SheetProfile } from '../types/sheet';

type Point = SheetProfile['outline'][number];

export type Edge = [Point, Point];

export const pointKey = ([x, y]: Point) => `${Math.round(x * 10000)},${Math.round(y * 10000)}`;

export function polygonArea(loop: Point[]): number {
  return (
    loop.reduce((area, p, i) => {
      const q = loop[(i + 1) % loop.length];

      return area + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2
  );
}

function simplified(loop: Point[]): Point[] {
  return loop.filter((p, i) => {
    const a = loop[(i + loop.length - 1) % loop.length];
    const b = loop[(i + 1) % loop.length];
    const cross = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);

    return Math.abs(cross) > 0.00001 * Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]));
  });
}

export function canonicalLoop(loop: Point[], positive: boolean): Point[] {
  const points = simplified(loop);

  if (polygonArea(points) > 0 !== positive) points.reverse();

  const start = points.reduce((best, p, i) => {
    const q = points[best];

    return p[0] < q[0] - 0.0001 || (Math.abs(p[0] - q[0]) < 0.0001 && p[1] < q[1]) ? i : best;
  }, 0);

  return [...points.slice(start), ...points.slice(0, start)];
}

function walkLoop(start: string, neighbors: Map<string, string[]>, points: Map<string, Point>): Point[] | undefined {
  const loop: Point[] = [];
  let previous = '';
  let current = start;

  do {
    const next = neighbors.get(current)?.find((key) => key !== previous);

    if (!next || loop.length > neighbors.size) return undefined;

    loop.push(points.get(current)!);
    previous = current;
    current = next;
  } while (current !== start);

  return loop;
}

function addNeighbor(neighbors: Map<string, string[]>, key: string, next: string): boolean {
  const list = neighbors.get(key);

  if (!list) {
    neighbors.set(key, [next]);

    return true;
  }

  if (list.length === 2) return false;

  list.push(next);

  return true;
}

export function loopsOf(edges: Edge[]): Point[][] | undefined {
  const neighbors = new Map<string, string[]>();
  const points = new Map<string, Point>();

  for (const [a, b] of edges) {
    const ka = pointKey(a);
    const kb = pointKey(b);

    if (!addNeighbor(neighbors, ka, kb) || !addNeighbor(neighbors, kb, ka)) return undefined;

    points.set(ka, a);
    points.set(kb, b);
  }

  for (const list of neighbors.values()) {
    if (list.length !== 2) return undefined;
  }

  const remaining = new Set(points.keys());
  const loops: Point[][] = [];

  while (remaining.size) {
    const loop = walkLoop(remaining.values().next().value!, neighbors, points);

    if (!loop || loop.length < 3) return undefined;

    loop.forEach((p) => remaining.delete(pointKey(p)));
    loops.push(loop);
  }

  if (loops.length < 2) return loops;

  return loops
    .map((points) => ({ points, area: Math.abs(polygonArea(points)) }))
    .sort((a, b) => b.area - a.area)
    .map(({ points }) => points);
}

export function inside(point: Point, polygon: Point[]): boolean {
  let result = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = a[1] > point[1] !== b[1] > point[1];
    const atX = ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];

    if (crosses && point[0] < atX) result = !result;
  }

  return result;
}
