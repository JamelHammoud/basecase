import { closure, couplerOffset, type FourBar, type Vec2 } from './linkageKinematics';

export interface FitBounds {
  minLink: number;
  maxLink: number;
}

export interface FitProblem {
  targets: Vec2[];
  direction: 1 | -1;
  bounds: FitBounds;
}

export interface FitLinkage extends FourBar {
  origin: Vec2;
  angle: number;
  thetas: number[];
}

const BASE = 9;
const PENALTY = 10;
const GRASHOF_MARGIN = 0.02;
const MAX_SWEEP = 2 * Math.PI * 0.97;
const MIN_STEP = 1e-3;
const STEP_H = 1e-6;
const MAX_ITERATIONS = 150;
const TOLERANCE = 1e-12;
const MIN_GAIN = 1e-7;

export const unknownCount = (n: number) => BASE + n;

export function decode(x: Float64Array, n: number, direction: 1 | -1): FitLinkage {
  const thetas = [x[9]];

  for (let i = 1; i < n; i++) thetas.push(thetas[i - 1] + direction * (MIN_STEP + Math.exp(x[9 + i])));

  return {
    origin: [x[0], x[1]],
    angle: x[2],
    ground: Math.exp(x[3]),
    crank: Math.exp(x[4]),
    coupler: Math.exp(x[5]),
    rocker: Math.exp(x[6]),
    point: [x[7], x[8]],
    thetas,
  };
}

export function encode(l: FitLinkage, direction: 1 | -1): Float64Array {
  const x = new Float64Array(unknownCount(l.thetas.length));

  x.set([l.origin[0], l.origin[1], l.angle, ...[l.ground, l.crank, l.coupler, l.rocker].map(Math.log), ...l.point]);
  x[9] = l.thetas[0];

  for (let i = 1; i < l.thetas.length; i++) {
    const step = direction * (l.thetas[i] - l.thetas[i - 1]) - MIN_STEP;

    x[9 + i] = Math.log(Math.max(step, 1e-6));
  }

  return x;
}

const over = (v: number) => Math.max(0, v);

function clampedClosure(l: FourBar, theta: number): { p: Vec2; miss: number } {
  const exact = closure(l, theta);

  if (exact) return { p: couplerOffset(exact.b, exact.c, l.point, l.coupler), miss: 0 };

  const b: Vec2 = [l.crank * Math.cos(theta), l.crank * Math.sin(theta)];
  const e = Math.hypot(l.ground - b[0], b[1]);
  const miss = over(e - l.coupler - l.rocker) + over(Math.abs(l.coupler - l.rocker) - e);
  const phi = Math.atan2(-b[1], l.ground - b[0]);
  const c: Vec2 = [b[0] + l.coupler * Math.cos(phi), b[1] + l.coupler * Math.sin(phi)];

  return { p: couplerOffset(b, c, l.point, l.coupler), miss };
}

function boundResiduals(l: FitLinkage, { minLink, maxLink }: FitBounds): number[] {
  const others = [l.ground, l.coupler, l.rocker];
  const longest = Math.max(...others);
  const rest = others.reduce((s, v) => s + v, 0) - longest;
  const links = [l.ground, l.crank, l.coupler, l.rocker];

  return [
    PENALTY * over(l.crank * (1 + GRASHOF_MARGIN) - Math.min(...others)),
    PENALTY * over(l.crank + longest - rest + GRASHOF_MARGIN * l.crank),
    ...links.map((v) => PENALTY * (over(minLink - v) + over(v - maxLink))),
    PENALTY * over(Math.hypot(l.point[0], l.point[1]) - maxLink),
  ];
}

export function residuals(x: Float64Array, problem: FitProblem): number[] {
  const { targets, direction, bounds } = problem;
  const l = decode(x, targets.length, direction);
  const cos = Math.cos(l.angle);
  const sin = Math.sin(l.angle);
  const out: number[] = [];
  let miss = 0;

  targets.forEach((t, i) => {
    const { p, miss: m } = clampedClosure(l, l.thetas[i]);

    out.push(l.origin[0] + p[0] * cos - p[1] * sin - t[0], l.origin[1] + p[0] * sin + p[1] * cos - t[1]);
    miss += m;
  });

  const sweep = Math.abs(l.thetas[l.thetas.length - 1] - l.thetas[0]);

  return [...out, PENALTY * miss, PENALTY * over(sweep - MAX_SWEEP), ...boundResiduals(l, bounds)];
}

const sumSquares = (r: number[]) => r.reduce((s, v) => s + v * v, 0);

function jacobian(x: Float64Array, r0: number[], problem: FitProblem): Float64Array[] {
  const columns: Float64Array[] = [];

  for (let k = 0; k < x.length; k++) {
    const saved = x[k];

    x[k] = saved + STEP_H;

    const r = residuals(x, problem);

    x[k] = saved;
    columns.push(Float64Array.from(r, (v, i) => (v - r0[i]) / STEP_H));
  }

  return columns;
}

const dot = (a: Float64Array, b: ArrayLike<number>) => {
  let s = 0;

  for (let i = 0; i < a.length; i++) s += a[i] * b[i];

  return s;
};

function eliminate(m: Float64Array, n: number, col: number): boolean {
  const width = n + 1;
  let pivot = col;

  for (let row = col + 1; row < n; row++)
    if (Math.abs(m[row * width + col]) > Math.abs(m[pivot * width + col])) pivot = row;

  if (Math.abs(m[pivot * width + col]) < 1e-300) return false;

  for (let k = 0; k < width && pivot !== col; k++) {
    const t = m[col * width + k];

    m[col * width + k] = m[pivot * width + k];
    m[pivot * width + k] = t;
  }

  for (let row = col + 1; row < n; row++) {
    const f = m[row * width + col] / m[col * width + col];

    for (let k = col; k < width; k++) m[row * width + k] -= f * m[col * width + k];
  }

  return true;
}

function solveLinear(m: Float64Array, n: number): Float64Array | null {
  const width = n + 1;

  for (let col = 0; col < n; col++) if (!eliminate(m, n, col)) return null;

  const out = new Float64Array(n);

  for (let row = n - 1; row >= 0; row--) {
    let s = m[row * width + n];

    for (let k = row + 1; k < n; k++) s -= m[row * width + k] * out[k];

    out[row] = s / m[row * width + row];
  }

  return out;
}

function normalEquations(columns: Float64Array[], r: number[], lambda: number): Float64Array {
  const n = columns.length;
  const width = n + 1;
  const m = new Float64Array(n * width);

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const v = dot(columns[i], columns[j]);

      m[i * width + j] = v;
      m[j * width + i] = v;
    }

    m[i * width + i] += lambda * (m[i * width + i] + 1e-9);
    m[i * width + n] = -dot(columns[i], r);
  }

  return m;
}

interface Trial {
  x: Float64Array;
  r: number[];
  cost: number;
}

function trialStep(state: Trial, lambda: number, problem: FitProblem, columns: Float64Array[]): Trial | null {
  const step = solveLinear(normalEquations(columns, state.r, lambda), columns.length);

  if (!step) return null;

  const x = Float64Array.from(state.x, (v, i) => v + step[i]);
  const r = residuals(x, problem);

  return { x, r, cost: sumSquares(r) };
}

export interface FitBudget {
  checkAt: number;
  worstCost: number;
}

export function levenbergMarquardt(
  start: Float64Array,
  problem: FitProblem,
  budget?: FitBudget,
): { x: Float64Array; cost: number } {
  const first = residuals(start, problem);
  let state: Trial = { x: Float64Array.from(start), r: first, cost: sumSquares(first) };
  let columns = jacobian(state.x, state.r, problem);
  let lambda = 1e-3;

  for (let iteration = 0; iteration < MAX_ITERATIONS && state.cost > TOLERANCE && lambda < 1e10; iteration++) {
    if (budget && iteration === budget.checkAt && state.cost > budget.worstCost) break;

    const trial = trialStep(state, lambda, problem, columns);

    if (!trial || trial.cost >= state.cost || Number.isNaN(trial.cost)) {
      lambda *= 4;

      continue;
    }

    const gain = (state.cost - trial.cost) / state.cost;

    state = trial;
    columns = jacobian(state.x, state.r, problem);
    lambda = Math.max(lambda / 3, 1e-9);

    if (gain < MIN_GAIN) break;
  }

  return { x: state.x, cost: state.cost };
}
