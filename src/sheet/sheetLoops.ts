export type Point = [number, number];
export type Loop = Point[];

const WELD = 1e4;
const COLLINEAR = 1e-9;
const AREA_TOL = 1e-3;

const keyOf = (p: Point) => `${Math.round(p[0] * WELD)},${Math.round(p[1] * WELD)}`;

class Welded {
  readonly points: Point[] = [];
  private readonly ids = new Map<string, number>();

  id(p: Point): number {
    const key = keyOf(p);
    let id = this.ids.get(key);

    if (id === undefined) {
      id = this.points.length;
      this.ids.set(key, id);
      this.points.push(p);
    }

    return id;
  }
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

function triangleEdges(tris: Point[][], weld: Welded): Array<[number, number]> {
  return tris.flatMap((tri) => {
    const ids = tri.map((p) => weld.id(p));

    return [0, 1, 2].map((k) => [ids[k], ids[(k + 1) % 3]] as [number, number]).filter(([a, b]) => a !== b);
  });
}

function boundaryNext(tris: Point[][], weld: Welded): Map<number, number> | null {
  const directed = triangleEdges(tris, weld);
  const uses = new Map<string, number>();

  for (const [a, b] of directed) uses.set(edgeKey(a, b), (uses.get(edgeKey(a, b)) ?? 0) + 1);

  const next = new Map<number, number>();

  for (const [a, b] of directed) {
    if (uses.get(edgeKey(a, b)) !== 1) continue;

    if (next.has(a)) return null;

    next.set(a, b);
  }

  return next;
}

function walkLoops(next: Map<number, number>): number[][] | null {
  const left = new Set(next.keys());
  const loops: number[][] = [];

  for (const start of next.keys()) {
    if (!left.has(start)) continue;

    const loop: number[] = [];
    let at: number | undefined = start;

    while (at !== undefined && left.has(at)) {
      left.delete(at);
      loop.push(at);
      at = next.get(at);
    }

    if (at !== start) return null;

    loops.push(loop);
  }

  return loops;
}

const turn = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);

function withoutStraights(loop: Loop): Loop {
  return loop.filter((p, i) => {
    const prev = loop[(i + loop.length - 1) % loop.length];
    const next = loop[(i + 1) % loop.length];

    return Math.abs(turn(prev, p, next)) > COLLINEAR;
  });
}

export const signedArea = (loop: Loop) =>
  loop.reduce((s, p, i) => {
    const q = loop[(i + 1) % loop.length];

    return s + (p[0] * q[1] - q[0] * p[1]) / 2;
  }, 0);

const lowest = (a: Point, b: Point) => a[0] - b[0] || a[1] - b[1];

function fromLowest(loop: Loop): Loop {
  const first = loop.reduce((best, p, i) => (lowest(p, loop[best]) < 0 ? i : best), 0);

  return [...loop.slice(first), ...loop.slice(0, first)];
}

const round = (v: number) => Math.round(v * WELD) / WELD + 0;

function placed(loop: Loop, origin: Point): Loop {
  return fromLowest(loop.map((p) => [round(p[0] - origin[0]), round(p[1] - origin[1])]));
}

export function faceLoops(tris: Point[][], faceArea: number): { outline: Loop; holes: Loop[] } | null {
  const weld = new Welded();
  const next = boundaryNext(tris, weld);
  const ids = next && walkLoops(next);

  if (!ids?.length) return null;

  const loops = ids.map((loop) => withoutStraights(loop.map((i) => weld.points[i]))).filter((l) => l.length >= 3);
  const areas = loops.map(signedArea);
  const outer = areas.indexOf(Math.max(...areas));
  const total = areas.reduce((s, a) => s + a, 0);

  if (Math.abs(total - faceArea) > AREA_TOL * faceArea || areas.some((a, i) => i !== outer && a >= 0)) return null;

  const origin: Point = [Math.min(...loops[outer].map((p) => p[0])), Math.min(...loops[outer].map((p) => p[1]))];
  const holes = loops
    .filter((_, i) => i !== outer)
    .map((l) => placed(l, origin))
    .sort((a, b) => lowest(a[0], b[0]));

  return { outline: placed(loops[outer], origin), holes };
}
