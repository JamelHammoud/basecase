import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotPoseState } from '../types/robotics';
import { NOMINAL_PHYSICS, type PhysicsScales } from '../sim/physicsScales';
import { cem } from './anythingCem';
import type { Skill } from './artifacts';
import type { Environment } from './environment';
import { hashOf } from './hash';
import {
  fails,
  STRESS_AXES,
  STRESS_LIMITS,
  STRESS_STARTS,
  StressBench,
  type StressAxis,
  type StressSample,
} from './stressBench';

export { STRESS_AXES, STRESS_LIMITS, type StressAxis, type StressSample } from './stressBench';

export const STRESS_BUDGET = 160;
export const MIN_STRESS_BUDGET = 24;
export const MAX_STRESS_BUDGET = 2000;

const JOINT_SHARE = 0.4;
const BISECTIONS = 5;
const AXIS_SAMPLES = 4;
const JOINT_SAMPLES = 8;
const MOVED = 0.02;
const MAX_FINDINGS = 3;

export type StressSide = 'below' | 'above';

export interface AxisReport {
  axis: StressAxis;
  side: StressSide | null;
  boundary: number | null;
  worst: StressSample;
}

export interface StressFinding {
  axis: StressAxis | 'combined';
  side: StressSide | null;
  boundary: number | null;
  point: PhysicsScales;
  start: RobotPoseState;
  margin: number;
}

export interface StressResult {
  seed: string;
  budget: number;
  rollouts: number;
  nominal: StressSample;
  axes: AxisReport[];
  worst: StressSample;
  starts: RobotPoseState[];
  findings: StressFinding[];
  trace: StressSample[];
}

export interface StressInput {
  mj: MainModule;
  model: SimModel;
  skill: Pick<Skill, 'controller'>;
  environment: Environment;
  budget?: number;
  seed?: string;
  stop?: () => boolean;
}

const span = (axis: StressAxis) => STRESS_LIMITS[axis][1] - STRESS_LIMITS[axis][0];

const toUnit = (axis: StressAxis, value: number) => (value - STRESS_LIMITS[axis][0]) / span(axis);

const fromUnit = (axis: StressAxis, u: number) => STRESS_LIMITS[axis][0] + Math.min(1, Math.max(0, u)) * span(axis);

const along = (axis: StressAxis, value: number): PhysicsScales => ({ ...NOMINAL_PHYSICS, [axis]: value });

const lower = (a: StressSample, b: StressSample) => (b.margin < a.margin ? b : a);

export const stressBudget = (budget = STRESS_BUDGET) =>
  Math.round(Math.min(MAX_STRESS_BUDGET, Math.max(MIN_STRESS_BUDGET, budget)));

interface Search {
  bench: StressBench;
  seed: string;
  nominal: StressSample;
}

async function axisWorst(search: Search, axis: StressAxis, points: number): Promise<StressSample> {
  const { bench, seed, nominal } = search;
  let worst = nominal;
  const track = async (value: number) => {
    const sample = await bench.sample(along(axis, value));

    if (sample) worst = lower(worst, sample);

    return sample;
  };

  bench.limit(points);

  for (const edge of STRESS_LIMITS[axis]) await track(edge);

  await cem({
    mean: [toUnit(axis, worst.point[axis])],
    sigma: [0.3],
    samples: AXIS_SAMPLES,
    elites: 2,
    iterations: Math.floor(bench.left() / STRESS_STARTS / AXIS_SAMPLES),
    seed: `stress|${seed}|${axis}`,
    score: async ([u]) => {
      const sample = await track(fromUnit(axis, u));

      return sample ? -sample.margin : -Infinity;
    },
    stop: () => bench.left() <= 0,
  });

  return worst;
}

function crossing(axis: StressAxis, passing: StressSample, failing: StressSample): number {
  const share = passing.margin / (passing.margin - failing.margin);
  const [a, b] = [passing.point[axis], failing.point[axis]];

  return a + Math.min(1, Math.max(0, share)) * (b - a);
}

async function boundaryOf(search: Search, axis: StressAxis, worst: StressSample): Promise<number | null> {
  const { bench, nominal } = search;

  if (!fails(worst)) return null;

  if (fails(nominal)) return nominal.point[axis];

  let [passing, failing] = [nominal, worst];

  bench.limit(BISECTIONS);

  for (let k = 0; k < BISECTIONS; k++) {
    const sample = await bench.sample(along(axis, (passing.point[axis] + failing.point[axis]) / 2));

    if (!sample) break;

    if (fails(sample)) failing = sample;
    else passing = sample;
  }

  return crossing(axis, passing, failing);
}

async function axisReport(search: Search, axis: StressAxis, points: number): Promise<AxisReport> {
  const worst = await axisWorst(search, axis, Math.max(2, points - BISECTIONS));
  const boundary = await boundaryOf(search, axis, worst);
  const side = worst.point[axis] < NOMINAL_PHYSICS[axis] ? 'below' : 'above';

  return { axis, side: worst === search.nominal ? null : side, boundary, worst };
}

async function jointWorst(search: Search, axes: AxisReport[]): Promise<StressSample> {
  const { bench, seed } = search;
  let worst = axes.reduce((w, r) => lower(w, r.worst), search.nominal);
  const pointOf = (u: number[]) =>
    Object.fromEntries(STRESS_AXES.map((axis, i) => [axis, fromUnit(axis, u[i])])) as unknown as PhysicsScales;

  bench.unlimit();
  await cem({
    mean: axes.map((r) => toUnit(r.axis, r.worst.point[r.axis])),
    sigma: STRESS_AXES.map(() => 0.25),
    samples: JOINT_SAMPLES,
    elites: 3,
    iterations: Math.ceil(bench.left() / STRESS_STARTS / JOINT_SAMPLES),
    seed: `stress|${seed}|joint`,
    score: async (u) => {
      const sample = await bench.sample(pointOf(u));

      if (!sample) return -Infinity;

      worst = lower(worst, sample);

      return -sample.margin;
    },
    stop: () => bench.left() <= 0,
  });

  return worst;
}

const movedAxes = (point: PhysicsScales) =>
  STRESS_AXES.filter((axis) => Math.abs(toUnit(axis, point[axis]) - toUnit(axis, NOMINAL_PHYSICS[axis])) > MOVED);

export function stressFindings(input: { axes: AxisReport[]; worst: StressSample; starts: RobotPoseState[] }) {
  const { axes, worst, starts } = input;
  const finding = (sample: StressSample) => ({
    point: sample.point,
    start: starts[sample.start],
    margin: sample.margin,
  });
  const single = axes.flatMap((r): StressFinding[] =>
    r.boundary === null ? [] : [{ axis: r.axis, side: r.side, boundary: r.boundary, ...finding(r.worst) }],
  );
  const weakest = Math.min(...axes.map((r) => r.worst.margin));
  const combined: StressFinding[] =
    fails(worst) && movedAxes(worst.point).length > 1 && worst.margin < weakest
      ? [{ axis: 'combined', side: null, boundary: null, ...finding(worst) }]
      : [];

  return [...combined, ...single].sort((a, b) => a.margin - b.margin).slice(0, MAX_FINDINGS);
}

export async function stressSkill(input: StressInput): Promise<StressResult> {
  const budget = stressBudget(input.budget);
  const seed = input.seed ?? hashOf(input.skill.controller).slice(0, 16);
  const bench = new StressBench({ ...input, controller: input.skill.controller, budget, seed });

  try {
    const nominal = await bench.sample(NOMINAL_PHYSICS);

    if (!nominal) throw new Error('Stress stopped before its first run.');

    const search: Search = { bench, seed, nominal };
    const perAxis = Math.floor(((1 - JOINT_SHARE) * budget) / STRESS_STARTS / STRESS_AXES.length);
    const axes: AxisReport[] = [];

    for (const axis of STRESS_AXES) axes.push(await axisReport(search, axis, perAxis));

    const worst = await jointWorst(search, axes);

    return {
      seed,
      budget,
      rollouts: bench.rollouts,
      nominal,
      axes,
      worst,
      starts: bench.starts,
      findings: stressFindings({ axes, worst, starts: bench.starts }),
      trace: [...bench.trace],
    };
  } finally {
    bench.dispose();
  }
}
