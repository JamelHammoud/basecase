import { cem } from './anythingCem';

export const STRESS_AXES = ['friction', 'mass', 'strength', 'latencyMs'] as const;

export type StressAxis = (typeof STRESS_AXES)[number];
export type StressPoint = Record<StressAxis, number>;
export type StressJudge = (point: StressPoint) => Promise<number>;

export const STRESS_LIMITS: Readonly<Record<StressAxis, readonly [number, number]>> = Object.freeze({
  friction: Object.freeze([0.2, 1.5] as const),
  mass: Object.freeze([0.5, 2] as const),
  strength: Object.freeze([0.4, 1.2] as const),
  latencyMs: Object.freeze([0, 150] as const),
});

export const NOMINAL: Readonly<StressPoint> = Object.freeze({ friction: 1, mass: 1, strength: 1, latencyMs: 0 });

export const STRESS_BUDGET = 120;
export const MIN_STRESS_BUDGET = 16;

const TOLERANCE_SHARE = 0.02;
const AXIS_SHARE = 0.6;
const AXIS_SAMPLES = 4;
const AXIS_ELITES = 2;
const JOINT_SAMPLES = 8;
const JOINT_ELITES = 3;
const JOINT_SIGMA = 0.35;

export interface StressRun {
  point: StressPoint;
  margin: number;
}

export interface AxisResult {
  axis: StressAxis;
  side: 'below' | 'above' | null;
  boundary: number | null;
  worst: StressRun;
}

export interface SearchInput {
  judge: StressJudge;
  seed: string;
  budget: number;
  stop?: () => boolean;
  onProgress?: (share: number) => void;
}

export interface SearchResult {
  nominal: StressRun;
  axes: AxisResult[];
  worst: StressRun;
  rollouts: number;
}

const span = (axis: StressAxis) => STRESS_LIMITS[axis][1] - STRESS_LIMITS[axis][0];

const clampTo = (axis: StressAxis, v: number) => {
  const [lo, hi] = STRESS_LIMITS[axis];

  return Math.min(hi, Math.max(lo, v));
};

const rounded = (v: number) => Math.round(v * 1e6) / 1e6;

export function stressPoint(values: Partial<StressPoint>): StressPoint {
  const point = { ...NOMINAL, ...values };

  return Object.fromEntries(STRESS_AXES.map((a) => [a, rounded(clampTo(a, point[a]))])) as StressPoint;
}

const keyOf = (p: StressPoint) => STRESS_AXES.map((a) => p[a]).join('|');

class Rollouts {
  count = 0;
  private cache = new Map<string, number>();
  private input: SearchInput;
  private worst: StressRun | null = null;

  constructor(input: SearchInput) {
    this.input = input;
  }

  left(limit = this.input.budget) {
    return this.input.stop?.() ? 0 : Math.max(0, Math.min(limit, this.input.budget) - this.count);
  }

  async margin(point: StressPoint, limit = this.input.budget): Promise<number | null> {
    const key = keyOf(point);
    const known = this.cache.get(key);

    if (known !== undefined) return known;

    if (this.left(limit) <= 0) return null;

    this.count += 1;

    const margin = await this.input.judge(point);

    this.cache.set(key, margin);

    if (!this.worst || margin < this.worst.margin) this.worst = { point, margin };

    this.input.onProgress?.(this.count / this.input.budget);

    return margin;
  }

  worstRun(): StressRun | null {
    return this.worst;
  }
}

interface AxisPlan {
  axis: StressAxis;
  rollouts: Rollouts;
  limit: number;
  seed: string;
  nominal: StressRun;
}

const lowest = (runs: StressRun[]) => runs.reduce((a, b) => (b.margin < a.margin ? b : a), runs[0]);

async function axisWorst(plan: AxisPlan): Promise<StressRun> {
  const { axis, rollouts, limit } = plan;
  const runs: StressRun[] = [plan.nominal];
  const reserve = Math.ceil(Math.log2(1 / TOLERANCE_SHARE));
  const cemLimit = limit - reserve;

  const tried = async (v: number, cap = cemLimit) => {
    const point = stressPoint({ [axis]: v });
    const margin = await rollouts.margin(point, cap);

    if (margin !== null) runs.push({ point, margin });

    return margin;
  };

  for (const end of STRESS_LIMITS[axis]) await tried(end, rollouts.count + 1);

  await cem({
    mean: [lowest(runs).point[axis]],
    sigma: [span(axis) / 4],
    samples: AXIS_SAMPLES,
    elites: AXIS_ELITES,
    iterations: Math.max(1, Math.ceil((cemLimit - rollouts.count) / AXIS_SAMPLES)),
    seed: plan.seed,
    stop: () => rollouts.left(cemLimit) <= 0,
    score: async ([v]) => {
      const margin = await tried(v);

      return margin === null ? -Infinity : -margin;
    },
  });

  return lowest(runs);
}

async function bisect(plan: AxisPlan, failing: StressRun): Promise<number> {
  const { axis, rollouts, limit } = plan;
  const tolerance = TOLERANCE_SHARE * span(axis);
  let [pass, fail] = [plan.nominal.point[axis], failing.point[axis]];

  while (Math.abs(pass - fail) > tolerance) {
    const mid = rounded((pass + fail) / 2);
    const margin = await rollouts.margin(stressPoint({ [axis]: mid }), limit);

    if (margin === null) break;

    if (margin > 0) pass = mid;
    else fail = mid;
  }

  return rounded((pass + fail) / 2);
}

async function searchAxis(plan: AxisPlan): Promise<AxisResult> {
  const { axis, nominal } = plan;
  const worst = await axisWorst(plan);

  if (worst.margin > 0) return { axis, side: null, boundary: null, worst };

  const side = worst.point[axis] < NOMINAL[axis] ? 'below' : 'above';

  if (nominal.margin <= 0) return { axis, side, boundary: NOMINAL[axis], worst };

  return { axis, side, boundary: await bisect(plan, worst), worst };
}

const toUnit = (axis: StressAxis, v: number) => (v - STRESS_LIMITS[axis][0]) / span(axis);
const fromUnit = (axis: StressAxis, u: number) => STRESS_LIMITS[axis][0] + u * span(axis);

async function searchJoint(rollouts: Rollouts, axes: AxisResult[], seed: string) {
  const start = stressPoint(Object.fromEntries(axes.map((a) => [a.axis, a.worst.point[a.axis]])));
  const free = rollouts.left();

  if (free <= 0) return;

  await cem({
    mean: STRESS_AXES.map((a) => toUnit(a, start[a])),
    sigma: STRESS_AXES.map(() => JOINT_SIGMA),
    samples: JOINT_SAMPLES,
    elites: JOINT_ELITES,
    iterations: Math.max(1, Math.ceil(free / JOINT_SAMPLES)),
    seed,
    stop: () => rollouts.left() <= 0,
    score: async (u) => {
      const point = stressPoint(Object.fromEntries(STRESS_AXES.map((a, i) => [a, fromUnit(a, u[i])])));
      const margin = await rollouts.margin(point);

      return margin === null ? -Infinity : -margin;
    },
  });
}

export async function searchStress(input: SearchInput): Promise<SearchResult> {
  const budget = Math.max(MIN_STRESS_BUDGET, Math.floor(input.budget));
  const rollouts = new Rollouts({ ...input, budget });
  const point = stressPoint({});
  const nominal: StressRun = { point, margin: (await rollouts.margin(point)) ?? Infinity };
  const share = Math.floor((budget * AXIS_SHARE) / STRESS_AXES.length);
  const axes: AxisResult[] = [];

  for (const axis of STRESS_AXES) {
    const limit = rollouts.count + share;

    axes.push(await searchAxis({ axis, rollouts, limit, seed: `stress|${input.seed}|${axis}`, nominal }));
  }

  await searchJoint(rollouts, axes, `stress|${input.seed}|joint`);

  return { nominal, axes, worst: rollouts.worstRun() ?? nominal, rollouts: rollouts.count };
}
