import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import { cem } from './anythingCem';
import { skillHash, type Skill } from './artifacts';
import type { Environment } from './environment';
import { sha256Hex } from './hash';
import type { RobotPoseState } from '../types/robotics';
import {
  NOMINAL_RUN,
  STRESS_AXES,
  stressBench,
  stressStart,
  type StressAxis,
  type StressProbe,
  type StressRun,
} from './stressProbe';

export { NOMINAL_RUN, STRESS_AXES, type StressAxis, type StressRun } from './stressProbe';

export const STRESS_LIMITS: Readonly<Record<StressAxis, readonly [number, number]>> = Object.freeze({
  friction: Object.freeze([0.2, 1.5] as const),
  mass: Object.freeze([0.5, 2] as const),
  strength: Object.freeze([0.4, 1.2] as const),
  latencyMs: Object.freeze([0, 150] as const),
});

export const STRESS_BUDGET = 48;
export const MIN_STRESS_BUDGET = 16;

export type StressSide = 'below' | 'above';

export interface StressAxisResult {
  axis: StressAxis;
  boundary: number | null;
  side: StressSide;
  margin: number;
  run: StressRun;
}

export interface StressResult {
  skill: string;
  seed: string;
  start: RobotPoseState;
  budget: number;
  rollouts: number;
  nominal: number;
  axes: StressAxisResult[];
  findings: StressAxisResult[];
  worst: { run: StressRun; margin: number };
}

export interface StressInput {
  mj: MainModule;
  model: SimModel;
  skill: Skill;
  environment: Environment;
  budget?: number;
  seed?: string;
  probe?: StressProbe;
  onProgress?: (share: number) => void;
}

interface Point {
  run: StressRun;
  margin: number;
}

interface Search {
  measure: (run: StressRun) => Promise<number>;
  left: () => number;
  seed: string;
}

const span = (axis: StressAxis) => STRESS_LIMITS[axis][1] - STRESS_LIMITS[axis][0];
const valueAt = (axis: StressAxis, u: number) => STRESS_LIMITS[axis][0] + Math.max(0, Math.min(1, u)) * span(axis);
const unitOf = (axis: StressAxis, value: number) => (value - STRESS_LIMITS[axis][0]) / span(axis);
const withAxis = (run: StressRun, axis: StressAxis, value: number): StressRun => ({ ...run, [axis]: value });
const runKey = (run: StressRun) => STRESS_AXES.map((a) => run[a].toFixed(9)).join('|');

export function stressPlan(budget: number) {
  const perAxis = Math.floor((budget - 1) / (STRESS_AXES.length + 1));
  const bisect = Math.min(6, Math.max(1, Math.ceil((perAxis - 2) * 0.6)));
  const searched = Math.max(0, perAxis - 2 - bisect);
  const samples = Math.min(4, searched);

  return { bisect, samples, iterations: samples ? Math.floor(searched / samples) : 0 };
}

type Plan = ReturnType<typeof stressPlan>;

function counted(probe: StressProbe, budget: number, onProgress?: (share: number) => void) {
  const seen = new Map<string, number>();
  let rollouts = 0;

  const measure = async (run: StressRun) => {
    const key = runKey(run);
    const known = seen.get(key);

    if (known !== undefined) return known;

    if (rollouts >= budget) return Infinity;

    rollouts += 1;

    const margin = await probe(run);

    seen.set(key, margin);
    onProgress?.(rollouts / budget);

    return margin;
  };

  return { measure, rollouts: () => rollouts, left: () => budget - rollouts };
}

async function worstOnAxis(search: Search, axis: StressAxis, plan: Plan): Promise<Point> {
  const points: Point[] = [];
  const at = async (u: number) => {
    const run = withAxis(NOMINAL_RUN, axis, valueAt(axis, u));
    const margin = await search.measure(run);

    points.push({ run, margin });

    return margin;
  };

  await at(0);
  await at(1);

  if (plan.iterations > 0)
    await cem({
      mean: [unitOf(axis, NOMINAL_RUN[axis])],
      sigma: [0.5],
      samples: plan.samples,
      elites: Math.min(2, plan.samples),
      iterations: plan.iterations,
      seed: `stress|${search.seed}|${axis}`,
      score: async ([u]) => -(await at(u)),
    });

  return points.reduce((a, b) => (b.margin < a.margin ? b : a), points[0]);
}

async function crossing(search: Search, axis: StressAxis, options: { worst: Point; steps: number }) {
  let pass = NOMINAL_RUN[axis];
  let fail = options.worst.run[axis];

  for (let step = 0; step < options.steps && search.left() > 0; step++) {
    const mid = (pass + fail) / 2;

    if ((await search.measure(withAxis(NOMINAL_RUN, axis, mid))) > 0) pass = mid;
    else fail = mid;
  }

  return (pass + fail) / 2;
}

async function searchAxis(search: Search, axis: StressAxis, at: { nominal: number; plan: Plan }) {
  const { nominal, plan } = at;
  const worst = await worstOnAxis(search, axis, plan);
  const side: StressSide = worst.run[axis] < NOMINAL_RUN[axis] ? 'below' : 'above';
  const base = { axis, side, margin: worst.margin, run: worst.run };

  if (worst.margin > 0) return { ...base, boundary: null } satisfies StressAxisResult;

  if (nominal <= 0) return { ...base, boundary: NOMINAL_RUN[axis] };

  return { ...base, boundary: await crossing(search, axis, { worst, steps: plan.bisect }) };
}

async function worstTogether(search: Search, axes: StressAxisResult[]): Promise<Point> {
  const start = axes.map((a) => unitOf(a.axis, a.run[a.axis]));
  const runOf = (u: number[]) =>
    Object.fromEntries(STRESS_AXES.map((axis, i) => [axis, valueAt(axis, u[i])])) as StressRun;
  const samples = Math.min(6, search.left() - 1);
  let best: Point = { run: runOf(start), margin: Infinity };

  if (samples < 1) return best;

  await cem({
    mean: start,
    sigma: start.map(() => 0.15),
    samples,
    elites: Math.min(3, samples),
    iterations: Math.floor((search.left() - 1) / samples),
    seed: `stress|${search.seed}|together`,
    score: async (u) => {
      const run = runOf(u);
      const margin = await search.measure(run);

      if (margin < best.margin) best = { run, margin };

      return -margin;
    },
  });

  return best;
}

const nearness = (a: StressAxisResult) => Math.abs(unitOf(a.axis, a.boundary!) - unitOf(a.axis, NOMINAL_RUN[a.axis]));

function benchFor(input: StressInput, start: RobotPoseState) {
  if (input.probe) return { probe: input.probe, dispose: () => undefined };

  const { mj, model, environment } = input;

  return stressBench({ mj, model, controller: input.skill.controller, environment, start });
}

export async function stressSkill(input: StressInput): Promise<StressResult> {
  const budget = Math.max(MIN_STRESS_BUDGET, Math.floor(input.budget ?? STRESS_BUDGET));
  const skill = skillHash(input.skill);
  const seed = input.seed ?? sha256Hex(`stress|${skill}`);
  const start = stressStart(input.model, input.environment, seed);
  const bench = benchFor(input, start);
  const count = counted(bench.probe, budget, input.onProgress);
  const search: Search = { measure: count.measure, left: count.left, seed };

  try {
    const nominal = await search.measure({ ...NOMINAL_RUN });
    const plan = stressPlan(budget);
    const axes: StressAxisResult[] = [];

    for (const axis of STRESS_AXES) axes.push(await searchAxis(search, axis, { nominal, plan }));

    const together = await worstTogether(search, axes);
    const alone = axes.reduce((a, b) => (b.margin < a.margin ? b : a), axes[0]);
    const worst = together.margin < alone.margin ? together : { run: alone.run, margin: alone.margin };
    const findings = axes.filter((a) => a.boundary !== null).sort((a, b) => nearness(a) - nearness(b));

    return { skill, seed, start, budget, rollouts: count.rollouts(), nominal, axes, findings, worst };
  } finally {
    bench.dispose();
  }
}
