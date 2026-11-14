import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import { cem } from './anythingCem';
import { skillHash, type Skill } from './artifacts';
import type { Environment } from './environment';
import { NOMINAL, physicsJudge, stressStart, type StressAxis, type StressJudge, type StressPoint } from './stressJudge';

export { NOMINAL, type StressAxis, type StressJudge, type StressPoint } from './stressJudge';

export const STRESS_AXES: readonly StressAxis[] = Object.freeze(['friction', 'mass', 'strength', 'latencyMs']);

export const STRESS_LIMITS: Readonly<Record<StressAxis, readonly [number, number]>> = Object.freeze({
  friction: Object.freeze([0.2, 1.5] as const),
  mass: Object.freeze([0.5, 2] as const),
  strength: Object.freeze([0.4, 1.2] as const),
  latencyMs: Object.freeze([0, 150] as const),
});

export const STRESS_BUDGET = 96;
export const MIN_STRESS_BUDGET = 16;
export const MAX_FINDINGS = 3;

const AXIS_SAMPLES = 4;
const JOINT_SAMPLES = 6;
const BISECT_STEPS = 6;
const DECIMALS: Record<StressAxis, number> = { friction: 3, mass: 3, strength: 3, latencyMs: 1 };

export type StressSide = 'below' | 'above';

export interface StressAxisResult {
  axis: StressAxis;
  worst: number;
  margin: number;
  side: StressSide;
  boundary: number | null;
}

export interface StressFinding {
  axis: StressAxis;
  side: StressSide;
  boundary: number;
  margin: number;
  replay: StressPoint;
}

export interface StressResult {
  skill: string;
  seed: string;
  start: number[];
  budget: number;
  rollouts: number;
  nominal: number;
  axes: StressAxisResult[];
  findings: StressFinding[];
  worst: { replay: StressPoint; margin: number };
}

export interface StressSearch {
  judge: StressJudge;
  seed: string;
  budget?: number;
  onProgress?: (share: number) => void;
  signal?: AbortSignal;
}

const round = (axis: StressAxis, v: number) => Number(v.toFixed(DECIMALS[axis]));

function valueAt(axis: StressAxis, u: number): number {
  const [lo, hi] = STRESS_LIMITS[axis];

  return round(axis, lo + Math.max(0, Math.min(1, u)) * (hi - lo));
}

const unitOf = (axis: StressAxis, v: number) => {
  const [lo, hi] = STRESS_LIMITS[axis];

  return (v - lo) / (hi - lo);
};

const keyOf = (p: StressPoint) => STRESS_AXES.map((a) => p[a]).join('|');

class Rollouts {
  count = 0;
  readonly seen = new Map<string, { point: StressPoint; margin: number }>();
  private options: StressSearch & { budget: number };

  constructor(options: StressSearch & { budget: number }) {
    this.options = options;
  }

  get left() {
    return this.options.budget - this.count;
  }

  async at(point: StressPoint): Promise<number> {
    const key = keyOf(point);
    const known = this.seen.get(key);

    if (known) return known.margin;

    if (this.options.signal?.aborted) throw new Error('Stopped.');

    if (this.left <= 0) return Infinity;

    this.count += 1;

    const margin = await this.options.judge(point);

    this.seen.set(key, { point, margin });
    this.options.onProgress?.(this.count / this.options.budget);

    return margin;
  }

  worst() {
    const all = [...this.seen.values()];

    return all.reduce((a, b) => (b.margin < a.margin ? b : a), all[0]);
  }
}

interface Plan {
  rollouts: Rollouts;
  seed: string;
}

const ENDS_SHARE = 0.3;
const BISECT_SHARE = 0.3;

const axisPoint = (axis: StressAxis, value: number): StressPoint => ({ ...NOMINAL, [axis]: value });

async function bisect(axis: StressAxis, plan: Plan & { steps: number }, ends: { pass: number; fail: number }) {
  let { pass, fail } = ends;

  for (let step = 0; step < plan.steps; step++) {
    const mid = round(axis, (pass + fail) / 2);

    if (mid === pass || mid === fail) break;

    if ((await plan.rollouts.at(axisPoint(axis, mid))) < 0) fail = mid;
    else pass = mid;
  }

  return round(axis, (pass + fail) / 2);
}

async function exploreAxis(
  axis: StressAxis,
  plan: Plan & { iterations: number },
): Promise<StressAxisResult & { nominal: number }> {
  const { rollouts } = plan;
  const tried: Array<{ value: number; margin: number }> = [];
  const at = async (value: number) => {
    const margin = await rollouts.at(axisPoint(axis, value));

    if (Number.isFinite(margin)) tried.push({ value, margin });

    return margin;
  };

  await at(NOMINAL[axis]);

  for (const end of STRESS_LIMITS[axis]) await at(end);

  await cem({
    mean: [unitOf(axis, NOMINAL[axis])],
    sigma: [0.5],
    samples: AXIS_SAMPLES,
    elites: 2,
    iterations: plan.iterations,
    seed: `stress|${plan.seed}|${axis}`,
    score: async ([u]) => -(await at(valueAt(axis, u))),
  });

  const worst = tried.reduce((a, b) => (b.margin < a.margin ? b : a), tried[0]);
  const side: StressSide = worst.value < NOMINAL[axis] ? 'below' : 'above';

  return { axis, worst: worst.value, margin: worst.margin, side, boundary: null, nominal: tried[0].margin };
}

async function searchJoint(axes: StressAxisResult[], plan: Plan) {
  const { rollouts } = plan;
  const pointOf = (u: number[]) => Object.fromEntries(STRESS_AXES.map((a, i) => [a, valueAt(a, u[i])])) as StressPoint;

  await cem({
    mean: axes.map((a) => unitOf(a.axis, a.worst)),
    sigma: STRESS_AXES.map(() => 0.2),
    samples: JOINT_SAMPLES,
    elites: 3,
    iterations: Math.max(0, Math.floor((rollouts.left - 1) / JOINT_SAMPLES)),
    seed: `stress|${plan.seed}|joint`,
    score: async (u) => -(await rollouts.at(pointOf(u))),
  });
}

async function searchAxes(plan: Plan, budget: number): Promise<StressAxisResult[]> {
  const ends = 2 * STRESS_AXES.length;
  const spare = Math.max(0, budget - 1 - ends);
  const iterations = Math.floor((spare * ENDS_SHARE) / STRESS_AXES.length / AXIS_SAMPLES);
  const explored = [];

  for (const axis of STRESS_AXES) explored.push(await exploreAxis(axis, { ...plan, iterations }));

  const failing = explored.filter((a) => a.margin < 0);
  const steps = Math.min(BISECT_STEPS, Math.floor((spare * BISECT_SHARE) / Math.max(1, failing.length)));

  for (const a of failing) {
    const pass = NOMINAL[a.axis];

    a.boundary = a.nominal < 0 ? pass : await bisect(a.axis, { ...plan, steps }, { pass, fail: a.worst });
  }

  return explored.map(({ nominal: _, ...a }) => a);
}

export const findingsOf = (axes: StressAxisResult[]): StressFinding[] =>
  axes
    .filter((a) => a.boundary !== null)
    .sort((a, b) => a.margin - b.margin)
    .slice(0, MAX_FINDINGS)
    .map((a) => ({
      axis: a.axis,
      side: a.side,
      boundary: a.boundary!,
      margin: a.margin,
      replay: { ...NOMINAL, [a.axis]: a.worst },
    }));

export async function stressSearch(options: StressSearch): Promise<Omit<StressResult, 'skill' | 'start'>> {
  const budget = Math.max(MIN_STRESS_BUDGET, Math.round(options.budget ?? STRESS_BUDGET));
  const rollouts = new Rollouts({ ...options, budget });
  const plan: Plan = { rollouts, seed: options.seed };
  const nominal = await rollouts.at({ ...NOMINAL });
  const axes = await searchAxes(plan, budget);

  await searchJoint(axes, plan);

  const worst = rollouts.worst();

  return {
    seed: options.seed,
    budget,
    rollouts: rollouts.count,
    nominal,
    axes,
    findings: findingsOf(axes),
    worst: { replay: worst.point, margin: worst.margin },
  };
}

export interface StressInput {
  mj: MainModule;
  model: SimModel;
  skill: Skill;
  environment: Environment;
  budget?: number;
  seed?: string;
  judge?: StressJudge;
  onProgress?: (share: number) => void;
  signal?: AbortSignal;
}

export async function stressSkill(input: StressInput): Promise<StressResult> {
  const { mj, model, skill, environment } = input;
  const hash = skillHash(skill);
  const seed = input.seed ?? hash;
  const start = stressStart(model, { environment, seed });
  const physics = input.judge ? null : physicsJudge({ mj, model, environment, controller: skill.controller, start });

  try {
    const result = await stressSearch({
      judge: input.judge ?? physics!.judge,
      seed,
      budget: input.budget,
      onProgress: input.onProgress,
      signal: input.signal,
    });

    return { skill: hash, start, ...result };
  } finally {
    physics?.dispose();
  }
}
