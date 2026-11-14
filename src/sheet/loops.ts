export type Point2 = [number, number];

interface Edge {
  a: string;
  b: string;
}

const GRID = 1e-4;

const keyOf = (p: Point2) => `${Math.round(p[0] / GRID)},${Math.round(p[1] / GRID)}`;

export const signedArea = (loop: Point2[]) =>
  loop.reduce((sum, [x, y], i) => {
    const [nx, ny] = loop[(i + 1) % loop.length];

    return sum + (x * ny - nx * y) / 2;
  }, 0);

function onSegment(p: Point2, a: Point2, b: Point2, tol: number): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) return false;

  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  const off = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.sqrt(len2);

  return t > 1e-6 && t < 1 - 1e-6 && off < tol;
}

class EdgeSet {
  readonly points = new Map<string, Point2>();
  private readonly directed = new Map<string, number>();

  add(p: Point2, q: Point2) {
    const a = keyOf(p);
    const b = keyOf(q);

    if (a === b) return;

    this.points.set(a, p);
    this.points.set(b, q);

    const reverse = `${b}>${a}`;
    const back = this.directed.get(reverse) ?? 0;

    if (back > 0) {
      this.decrement(reverse, back);

      return;
    }

    this.directed.set(`${a}>${b}`, (this.directed.get(`${a}>${b}`) ?? 0) + 1);
  }

  private decrement(key: string, count: number) {
    if (count === 1) this.directed.delete(key);
    else this.directed.set(key, count - 1);
  }

  edges(): Edge[] {
    return [...this.directed].flatMap(([key, count]) => {
      const [a, b] = key.split('>');

      return Array.from({ length: count }, () => ({ a, b }));
    });
  }

  splitAt(tol: number): boolean {
    const open = this.edges();
    const ends = [...new Set(open.flatMap((e) => [e.a, e.b]))];

    for (const edge of open) {
      const inner = ends.filter((k) =>
        onSegment(this.points.get(k)!, this.points.get(edge.a)!, this.points.get(edge.b)!, tol),
      );

      if (!inner.length) continue;

      const start = this.points.get(edge.a)!;
      const along = (k: string) => Math.hypot(this.points.get(k)![0] - start[0], this.points.get(k)![1] - start[1]);
      const chain = [edge.a, ...inner.sort((x, y) => along(x) - along(y)), edge.b];

      this.decrement(`${edge.a}>${edge.b}`, this.directed.get(`${edge.a}>${edge.b}`) ?? 1);

      for (let i = 0; i + 1 < chain.length; i++) this.add(this.points.get(chain[i])!, this.points.get(chain[i + 1])!);

      return true;
    }

    return false;
  }
}

function walkLoop(start: string, from: Map<string, Edge[]>, points: Map<string, Point2>): Point2[] | null {
  const loop: Point2[] = [];
  let at = start;

  do {
    const next = from.get(at)?.pop();

    if (!next) return null;

    loop.push(points.get(at)!);
    at = next.b;
  } while (at !== start);

  return loop;
}

function chainLoops(edges: Edge[], points: Map<string, Point2>): Point2[][] | null {
  const from = new Map<string, Edge[]>();

  for (const e of edges) from.set(e.a, [...(from.get(e.a) ?? []), e]);

  const loops: Point2[][] = [];

  for (const start of [...from.keys()].sort()) {
    while (from.get(start)?.length) {
      const loop = walkLoop(start, from, points);

      if (!loop) return null;

      loops.push(loop);
    }
  }

  return loops.reduce((n, l) => n + l.length, 0) === edges.length ? loops : null;
}

function withoutCollinear(loop: Point2[], tol: number): Point2[] {
  return loop.filter((p, i) => {
    const prev = loop[(i - 1 + loop.length) % loop.length];
    const next = loop[(i + 1) % loop.length];
    const len = Math.hypot(next[0] - prev[0], next[1] - prev[1]);
    const cross = (p[0] - prev[0]) * (next[1] - prev[1]) - (p[1] - prev[1]) * (next[0] - prev[0]);

    return len === 0 || Math.abs(cross) / len >= tol;
  });
}

function simplify(loop: Point2[], tol: number): Point2[] {
  let out = loop;

  for (;;) {
    const keep = withoutCollinear(out, tol);

    if (keep.length === out.length || keep.length < 3) return out;

    out = keep;
  }
}

const MAX_SPLITS = 10000;

export function boundaryLoops(triangles: Point2[][], tol: number): Point2[][] | null {
  const set = new EdgeSet();

  for (const [a, b, c] of triangles) {
    set.add(a, b);
    set.add(b, c);
    set.add(c, a);
  }

  for (let i = 0; i < MAX_SPLITS && set.splitAt(tol); i++);

  const loops = chainLoops(set.edges(), set.points);

  return loops && loops.map((l) => simplify(l, tol)).filter((l) => l.length >= 3);
}

export function canonicalLoop(loop: Point2[], ccw: boolean): Point2[] {
  const oriented = signedArea(loop) > 0 === ccw ? loop : [...loop].reverse();
  const first = oriented.reduce(
    (best, p, i) => (p[0] < oriented[best][0] || (p[0] === oriented[best][0] && p[1] < oriented[best][1]) ? i : best),
    0,
  );

  return [...oriented.slice(first), ...oriented.slice(0, first)];
}
