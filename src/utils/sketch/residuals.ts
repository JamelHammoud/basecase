import type { Sketch, SketchArc, SketchCircle, SketchConstraint, SketchEntity, SketchLine, Vec2 } from './types';

export interface Geometry {
  point: (id: string) => Vec2;
  radius: (circle: SketchCircle) => number;
  entity: (id: string) => SketchEntity | undefined;
}

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const len = (v: Vec2) => Math.hypot(v[0], v[1]);
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const safe = (v: number) => Math.max(v, 1e-9);

const DEG = Math.PI / 180;

const wrapAngle = (a: number) => {
  const t = (a + Math.PI) % (2 * Math.PI);

  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI;
};

export const lineDir = (g: Geometry, line: SketchLine) => sub(g.point(line.b), g.point(line.a));

export const entityRadius = (g: Geometry, e: SketchCircle | SketchArc) =>
  e.kind === 'circle' ? g.radius(e) : len(sub(g.point(e.a), g.point(e.c)));

const asLine = (g: Geometry, id: string) => {
  const e = g.entity(id);

  return e?.kind === 'line' ? e : null;
};

const asRound = (g: Geometry, id: string) => {
  const e = g.entity(id);

  return e && e.kind !== 'line' ? e : null;
};

const pointLineDistance = (g: Geometry, p: Vec2, line: SketchLine) => {
  const a = g.point(line.a);
  const d = lineDir(g, line);

  return Math.abs(cross(d, sub(p, a))) / safe(len(d));
};

const pairOfLines = (g: Geometry, a: string, b: string) => {
  const la = asLine(g, a);
  const lb = asLine(g, b);

  return la && lb ? [lineDir(g, la), lineDir(g, lb)] : null;
};

const tangent = (g: Geometry, a: string, b: string): number[] => {
  const line = asLine(g, a) ?? asLine(g, b);
  const rounds = [asRound(g, a), asRound(g, b)].filter((e): e is SketchCircle | SketchArc => !!e);

  if (line && rounds.length === 1) {
    return [pointLineDistance(g, g.point(rounds[0].c), line) - entityRadius(g, rounds[0])];
  }

  if (rounds.length !== 2) return [];

  const [p, q] = rounds;
  const gap = len(sub(g.point(p.c), g.point(q.c)));
  const rp = entityRadius(g, p);
  const rq = entityRadius(g, q);

  return gap < Math.max(rp, rq) ? [gap - Math.abs(rp - rq)] : [gap - (rp + rq)];
};

const equal = (g: Geometry, a: string, b: string): number[] => {
  const lines = pairOfLines(g, a, b);

  if (lines) return [len(lines[0]) - len(lines[1])];

  const p = asRound(g, a);
  const q = asRound(g, b);

  return p && q ? [entityRadius(g, p) - entityRadius(g, q)] : [];
};

const coincident = (g: Geometry, a: string, b: string): number[] => {
  const p = g.point(a);
  const target = g.entity(b);

  if (!target) {
    const q = g.point(b);

    return [p[0] - q[0], p[1] - q[1]];
  }

  if (target.kind === 'line')
    return [cross(lineDir(g, target), sub(p, g.point(target.a))) / safe(len(lineDir(g, target)))];

  return [len(sub(p, g.point(target.c))) - entityRadius(g, target)];
};

const distance = (g: Geometry, c: { a: string; b: string; value: number }): number[] => {
  const lineA = asLine(g, c.a);
  const lineB = asLine(g, c.b);

  if (lineA && lineB) return [pointLineDistance(g, g.point(lineA.a), lineB) - c.value];

  if (lineB) return [pointLineDistance(g, g.point(c.a), lineB) - c.value];

  if (lineA) return [pointLineDistance(g, g.point(c.b), lineA) - c.value];

  return [len(sub(g.point(c.a), g.point(c.b))) - c.value];
};

const angle = (g: Geometry, c: { line: string; other?: string; value: number }): number[] => {
  const line = asLine(g, c.line);

  if (!line) return [];

  const d = lineDir(g, line);
  const other = c.other ? asLine(g, c.other) : null;
  const base = other ? Math.atan2(lineDir(g, other)[1], lineDir(g, other)[0]) : 0;

  return [wrapAngle(Math.atan2(d[1], d[0]) - base - c.value * DEG)];
};

const lineResidual = (g: Geometry, id: string, fn: (line: SketchLine) => number): number[] => {
  const line = asLine(g, id);

  return line ? [fn(line)] : [];
};

export function constraintResiduals(g: Geometry, c: SketchConstraint): number[] {
  switch (c.kind) {
    case 'coincident':
      return coincident(g, c.a, c.b);
    case 'horizontal':
      return lineResidual(g, c.line, (l) => g.point(l.a)[1] - g.point(l.b)[1]);
    case 'vertical':
      return lineResidual(g, c.line, (l) => g.point(l.a)[0] - g.point(l.b)[0]);
    case 'parallel':
    case 'perpendicular': {
      const lines = pairOfLines(g, c.a, c.b);

      if (!lines) return [];

      const [p, q] = lines;
      const norm = safe(len(p) * len(q));

      return [(c.kind === 'parallel' ? cross(p, q) : dot(p, q)) / norm];
    }
    case 'equal':
      return equal(g, c.a, c.b);
    case 'tangent':
      return tangent(g, c.a, c.b);
    case 'length':
      return lineResidual(g, c.line, (l) => len(lineDir(g, l)) - c.value);
    case 'radius': {
      const round = asRound(g, c.entity);

      return round ? [entityRadius(g, round) - c.value] : [];
    }
    case 'angle':
      return angle(g, c);
    case 'distance':
      return distance(g, c);
  }
}

export function arcResiduals(g: Geometry, arc: SketchArc): number[] {
  const c = g.point(arc.c);

  return [len(sub(g.point(arc.a), c)) - len(sub(g.point(arc.b), c))];
}

export function allResiduals(g: Geometry, sketch: Sketch): number[] {
  const out: number[] = [];

  for (const e of sketch.entities) {
    if (e.kind === 'arc') out.push(...arcResiduals(g, e));
  }

  for (const c of sketch.constraints) out.push(...constraintResiduals(g, c));

  return out;
}
