import { rank, solveSquare, type Matrix } from './linalg';
import { allResiduals, type Geometry } from './residuals';
import type { Sketch, SketchCircle, SketchEntity, Vec2 } from './types';

export interface Drag {
  point: string;
  to: Vec2;
}

export type SolveResult = { status: 'ok'; sketch: Sketch; dof: number } | { status: 'over' };

const TOLERANCE = 1e-10;
const MAX_ITERATIONS = 80;
const MAX_DAMPING_TRIES = 12;
const DRAG_WEIGHT = 1e-12;
const STEP = 1e-7;

interface Layout {
  index: Map<string, number>;
  start: number[];
  weights: number[];
  fixed: Map<string, Vec2>;
}

const round = (v: number) => Math.round(v * 1e9) / 1e9 + 0;

function layout(sketch: Sketch, drag?: Drag): Layout {
  const index = new Map<string, number>();
  const start: number[] = [];
  const weights: number[] = [];
  const fixed = new Map<string, Vec2>();

  for (const p of sketch.points) {
    if (p.fixed) {
      fixed.set(p.id, [p.x, p.y]);

      continue;
    }

    const dragged = drag?.point === p.id;

    index.set(p.id, start.length);
    start.push(dragged ? drag.to[0] : p.x, dragged ? drag.to[1] : p.y);
    weights.push(dragged ? DRAG_WEIGHT : 1, dragged ? DRAG_WEIGHT : 1);
  }

  for (const e of sketch.entities) {
    if (e.kind !== 'circle') continue;

    index.set(e.id, start.length);
    start.push(e.r);
    weights.push(1);
  }

  return { index, start, weights, fixed };
}

function geometryAt(sketch: Sketch, lay: Layout, x: number[]): Geometry {
  const entities = new Map<string, SketchEntity>(sketch.entities.map((e) => [e.id, e]));

  return {
    point: (id) => {
      const i = lay.index.get(id);

      return i === undefined ? (lay.fixed.get(id) ?? [0, 0]) : [x[i], x[i + 1]];
    },
    radius: (circle: SketchCircle) => {
      const i = lay.index.get(circle.id);

      return i === undefined ? circle.r : x[i];
    },
    entity: (id) => entities.get(id),
  };
}

const residualsAt = (sketch: Sketch, lay: Layout, x: number[]) => allResiduals(geometryAt(sketch, lay, x), sketch);

const sumSquares = (r: number[]) => r.reduce((s, v) => s + v * v, 0);

const worst = (r: number[]) => r.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

function jacobian(sketch: Sketch, lay: Layout, x: number[], rows: number): Matrix {
  const j: Matrix = Array.from({ length: rows }, () => new Array<number>(x.length).fill(0));
  const probe = [...x];

  for (let c = 0; c < x.length; c++) {
    const h = STEP * Math.max(1, Math.abs(x[c]));

    probe[c] = x[c] + h;

    const up = residualsAt(sketch, lay, probe);

    probe[c] = x[c] - h;

    const down = residualsAt(sketch, lay, probe);

    probe[c] = x[c];

    for (let r = 0; r < rows; r++) j[r][c] = (up[r] - down[r]) / (2 * h);
  }

  return j;
}

function dampedStep(j: Matrix, w: number[], r: number[], damping: number): number[] | null {
  const rows = j.length;
  const a: Matrix = Array.from({ length: rows }, (_, p) =>
    Array.from({ length: rows }, (_, q) => {
      let s = p === q ? damping : 0;

      for (let c = 0; c < w.length; c++) s += j[p][c] * w[c] * j[q][c];

      return s;
    }),
  );
  const y = solveSquare(a, r);

  if (!y) return null;

  return w.map((wc, c) => {
    let s = 0;

    for (let p = 0; p < rows; p++) s += j[p][c] * y[p];

    return -wc * s;
  });
}

function improve(sketch: Sketch, lay: Layout, x: number[], state: { damping: number }): number[] | null {
  const r = residualsAt(sketch, lay, x);
  const j = jacobian(sketch, lay, x, r.length);
  const before = sumSquares(r);

  for (let t = 0; t < MAX_DAMPING_TRIES; t++) {
    const dx = dampedStep(j, lay.weights, r, state.damping);
    const next = dx && x.map((v, i) => v + dx[i]);

    if (next && sumSquares(residualsAt(sketch, lay, next)) < before) {
      state.damping = Math.max(state.damping / 10, 1e-14);

      return next;
    }

    state.damping *= 10;
  }

  return null;
}

function iterate(sketch: Sketch, lay: Layout): number[] | null {
  let x = lay.start;
  const state = { damping: 1e-10 };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (worst(residualsAt(sketch, lay, x)) < TOLERANCE) return x;

    const next = improve(sketch, lay, x, state);

    if (!next) return null;

    x = next;
  }

  return worst(residualsAt(sketch, lay, x)) < TOLERANCE * 100 ? x : null;
}

function written(sketch: Sketch, lay: Layout, x: number[]): Sketch {
  return {
    ...sketch,
    points: sketch.points.map((p) => {
      const i = lay.index.get(p.id);

      return i === undefined ? p : { ...p, x: round(x[i]), y: round(x[i + 1]) };
    }),
    entities: sketch.entities.map((e) => {
      const i = lay.index.get(e.id);

      return e.kind === 'circle' && i !== undefined ? { ...e, r: round(x[i]) } : e;
    }),
  };
}

export function solveSketch(sketch: Sketch, drag?: Drag): SolveResult {
  const lay = layout(sketch, drag);
  const rows = residualsAt(sketch, lay, lay.start).length;

  if (rows === 0) return { status: 'ok', sketch: written(sketch, lay, lay.start), dof: lay.start.length };

  if (rows > lay.start.length) return { status: 'over' };

  const x = iterate(sketch, lay);

  if (!x) return { status: 'over' };

  const independent = rank(jacobian(sketch, lay, x, rows));

  if (independent < rows) return { status: 'over' };

  return { status: 'ok', sketch: written(sketch, lay, x), dof: lay.start.length - independent };
}
