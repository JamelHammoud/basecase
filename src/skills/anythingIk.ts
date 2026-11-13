import type { MainModule } from '@mujoco/mujoco';
import type { SimEngine } from '../sim/engine';

export interface IkJoint {
  qpos: number;
  range: [number, number];
}

export interface IkTarget {
  body: number;
  axis: 0 | 1 | 2;
  value: number;
  local?: [number, number, number];
  tilt?: boolean;
}

const STEP = 1e-4;
const DAMPING = 1e-4;
const ITERATIONS = 120;
const FIT = 2e-4;
const RESTARTS = 6;
const NUDGE = 0.2;
const TILT_WEIGHT = 0.05;

function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let c = 0; c < n; c++) {
    const pivot = m.slice(c).reduce((best, row, i) => (Math.abs(row[c]) > Math.abs(m[best][c]) ? c + i : best), c);

    [m[c], m[pivot]] = [m[pivot], m[c]];

    for (let r = c + 1; r < n; r++) {
      const k = m[r][c] / (m[c][c] || 1e-12);

      for (let j = c; j <= n; j++) m[r][j] -= k * m[c][j];
    }
  }

  const x = new Array<number>(n).fill(0);

  for (let r = n - 1; r >= 0; r--) {
    const s = m[r].slice(r + 1, n).reduce((acc, v, j) => acc + v * x[r + 1 + j], 0);

    x[r] = (m[r][n] - s) / (m[r][r] || 1e-12);
  }

  return x;
}

export function targetValue(data: { xpos: ArrayLike<number>; xmat: ArrayLike<number> }, t: IkTarget): number {
  const { xpos, xmat } = data;

  if (t.tilt) return xmat[t.body * 9 + t.axis * 3 + 2] * TILT_WEIGHT;

  const local = t.local ?? [0, 0, 0];
  const row = t.body * 9 + t.axis * 3;

  return xpos[t.body * 3 + t.axis] + xmat[row] * local[0] + xmat[row + 1] * local[1] + xmat[row + 2] * local[2];
}

export const tiltGoal = (value: number) => value * TILT_WEIGHT;

interface Problem {
  joints: IkJoint[];
  targets: IkTarget[];
}

export class Ik {
  private readonly mj: MainModule;
  private readonly engine: SimEngine;

  constructor(mj: MainModule, engine: SimEngine) {
    this.mj = mj;
    this.engine = engine;
  }

  private read(q: number[], targets: IkTarget[]): number[] {
    const { data, model } = this.engine;

    data.qpos.set(q);
    this.mj.mj_kinematics(model, data);

    return targets.map((t) => targetValue(data, t));
  }

  private step(q: number[], problem: Problem): { q: number[]; miss: number } {
    const { joints, targets } = problem;
    const at = this.read(q, targets);
    const error = targets.map((t, i) => t.value - at[i]);
    const miss = Math.hypot(...error);
    const jac = joints.map((j) => {
      const moved = [...q];

      moved[j.qpos] += STEP;

      return this.read(moved, targets).map((v, i) => (v - at[i]) / STEP);
    });
    const jjt = targets.map((_, r) =>
      targets.map((__, c) => jac.reduce((s, col) => s + col[r] * col[c], 0) + (r === c ? DAMPING : 0)),
    );
    const y = solveLinear(jjt, error);
    const next = [...q];

    joints.forEach((j, k) => {
      const dq = jac[k].reduce((s, v, i) => s + v * y[i], 0);

      next[j.qpos] = Math.min(j.range[1], Math.max(j.range[0], q[j.qpos] + dq));
    });

    return { q: next, miss };
  }

  descend(start: number[], problem: Problem): { q: number[]; miss: number } {
    let q = [...start];
    let miss = Infinity;

    for (let k = 0; k < ITERATIONS && miss > FIT / 4; k++) {
      const next = this.step(q, problem);

      miss = next.miss;
      q = next.q;
    }

    const at = this.read(q, problem.targets);

    return { q, miss: Math.hypot(...problem.targets.map((t, i) => t.value - at[i])) };
  }

  private seeds(start: number[], problem: Problem): number[][] {
    const nudged = (sign: (i: number) => number) => {
      const q = [...start];

      problem.joints.forEach((j, i) => {
        q[j.qpos] = Math.min(j.range[1], Math.max(j.range[0], q[j.qpos] + NUDGE * sign(i)));
      });

      return q;
    };
    const spread = Array.from({ length: RESTARTS }, (_, r) => {
      const q = [...start];

      problem.joints.forEach((j, i) => {
        q[j.qpos] = j.range[0] + (j.range[1] - j.range[0]) * (0.15 + 0.07 * ((i * 7 + r * 3) % 11));
      });

      return q;
    });

    return [nudged(() => 1), nudged(() => -1), nudged((i) => (i % 2 ? -1 : 1)), ...spread];
  }

  solve(start: number[], problem: Problem): { q: number[]; miss: number } {
    if (!problem.targets.length || !problem.joints.length) return { q: [...start], miss: 0 };

    let best = this.descend(start, problem);

    for (const seed of this.seeds(start, problem)) {
      if (best.miss <= FIT) break;

      const tried = this.descend(seed, problem);

      if (tried.miss < best.miss) best = tried;
    }

    return best;
  }
}
