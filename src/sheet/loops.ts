export type Point2 = [number, number];

const KEY_SCALE = 1e4;
const STRAIGHT_SINE = 1e-6;

const keyOf = (p: Point2) => `${Math.round(p[0] * KEY_SCALE)},${Math.round(p[1] * KEY_SCALE)}`;

export function signedArea(loop: Point2[]): number {
  let sum = 0;

  for (let i = 0; i < loop.length; i++) {
    const [ax, ay] = loop[i];
    const [bx, by] = loop[(i + 1) % loop.length];

    sum += ax * by - bx * ay;
  }

  return sum / 2;
}

export function insideLoop(loop: Point2[], [x, y]: Point2): boolean {
  let inside = false;

  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i];
    const [xj, yj] = loop[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (crosses) inside = !inside;
  }

  return inside;
}

function boundaryEdges(triangles: Point2[][]) {
  const points = new Map<string, Point2>();
  const directed = new Map<string, number>();
  const edges: Array<[string, string]> = [];

  for (const tri of triangles) {
    const keys = tri.map((p) => {
      const k = keyOf(p);

      if (!points.has(k)) points.set(k, p);

      return k;
    });

    for (let i = 0; i < 3; i++) {
      const edge: [string, string] = [keys[i], keys[(i + 1) % 3]];

      if (edge[0] === edge[1]) continue;

      edges.push(edge);
      directed.set(`${edge[0]}>${edge[1]}`, (directed.get(`${edge[0]}>${edge[1]}`) ?? 0) + 1);
    }
  }

  const open = edges.filter(([a, b]) => !directed.has(`${b}>${a}`) && directed.get(`${a}>${b}`) === 1);

  return { points, open };
}

function chain(open: Array<[string, string]>): string[][] | null {
  const next = new Map<string, string[]>();

  for (const [a, b] of open) next.set(a, [...(next.get(a) ?? []), b]);

  const loops: string[][] = [];

  for (const [start] of open) {
    if (!next.get(start)?.length) continue;

    const loop: string[] = [];
    let at = start;

    while (loop.length <= open.length) {
      const outs = next.get(at);

      if (!outs?.length) return null;

      loop.push(at);
      at = outs.shift()!;

      if (at === start) break;
    }

    if (at !== start) return null;

    loops.push(loop);
  }

  return loops;
}

function straightAt(prev: Point2, at: Point2, next: Point2): boolean {
  const ax = at[0] - prev[0];
  const ay = at[1] - prev[1];
  const bx = next[0] - at[0];
  const by = next[1] - at[1];
  const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by);

  return lengths === 0 || (Math.abs(ax * by - ay * bx) <= STRAIGHT_SINE * lengths && ax * bx + ay * by > 0);
}

export function simplify(loop: Point2[]): Point2[] {
  let out = loop;
  let changed = true;

  while (changed && out.length > 3) {
    changed = false;

    const kept = out.filter(
      (p, i) => !straightAt(out[(i - 1 + out.length) % out.length], p, out[(i + 1) % out.length]),
    );

    if (kept.length !== out.length && kept.length >= 3) {
      out = kept;
      changed = true;
    }
  }

  return out;
}

export function boundaryLoops(triangles: Point2[][]): Point2[][] | null {
  const { points, open } = boundaryEdges(triangles);
  const loops = chain(open);

  return loops && loops.map((keys) => simplify(keys.map((k) => points.get(k)!)));
}

const before = (a: Point2, b: Point2) => a[0] - b[0] || a[1] - b[1];

export function startAtLowest(loop: Point2[]): Point2[] {
  const at = loop.reduce((best, p, i) => (before(p, loop[best]) < 0 ? i : best), 0);

  return [...loop.slice(at), ...loop.slice(0, at)];
}

export const lowestPoint = (loop: Point2[]): Point2 => loop.reduce((best, p) => (before(p, best) < 0 ? p : best));

export const compareLoops = (a: Point2[], b: Point2[]) => before(lowestPoint(a), lowestPoint(b));
