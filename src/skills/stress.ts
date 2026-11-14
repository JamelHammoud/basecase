import type { MainModule } from '@mujoco/mujoco';
import type { Controller } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import { signalReaders } from './arenaSignals';
import { ArenaWorld, seededRandom, type Instance } from './arenaWorld';
import { skillHash, type Skill } from './artifacts';
import { evaluateContract, type ContractResult } from './contract';
import { environmentHash, type Environment, type Randomization, type Range } from './environment';
import { sha256Hex } from './hash';
import type { RobotPoseState } from '../types/robotics';
import {
  NOMINAL,
  STRESS_AXES,
  STRESS_BUDGET,
  STRESS_LIMITS,
  searchStress,
  stressPoint,
  type AxisResult,
  type StressAxis,
  type StressJudge,
  type StressPoint,
  type StressRun,
} from './stressSearch';

export {
  NOMINAL,
  STRESS_AXES,
  STRESS_BUDGET,
  STRESS_LIMITS,
  stressPoint,
  type AxisResult,
  type StressAxis,
  type StressJudge,
  type StressPoint,
  type StressRun,
};

export const STRESS_VERSION = 1;
export const MAX_FINDINGS = 3;

export interface StressFinding {
  axis: StressAxis | 'combined';
  side: 'below' | 'above' | null;
  boundary: number | null;
  margin: number;
  point: StressPoint;
}

export interface StressResult {
  version: typeof STRESS_VERSION;
  skill: string;
  environment: string;
  seed: string;
  start: RobotPoseState;
  budget: number;
  rollouts: number;
  nominal: StressRun;
  axes: AxisResult[];
  worst: StressRun;
  findings: StressFinding[];
}

export interface StressInput {
  mj: MainModule;
  model: SimModel;
  skill: Skill;
  environment: Environment;
  budget?: number;
  seed?: string;
  judge?: StressJudge;
  signal?: AbortSignal;
  onProgress?: (share: number) => void;
}

export const instanceAt = (point: StressPoint): Instance => ({
  friction: point.friction,
  masses: [point.mass],
  strength: point.strength,
  latencyMs: point.latencyMs,
  jointNoise: [],
  yawDeg: 0,
  offsetMm: [0, 0],
});

export function stressMargin(result: Pick<ContractResult, 'passed' | 'margin'>, diverged = false): number {
  if (diverged || !Number.isFinite(result.margin)) return -1;

  return result.passed ? result.margin : Math.min(result.margin, 0);
}

export interface RolloutJudge {
  judge: StressJudge;
  dispose: () => void;
}

export function stressStart(model: SimModel, environment: Environment, seed: string): RobotPoseState {
  const base = environment.reset.pose ?? model.initial;
  const random = seededRandom(sha256Hex(`stress|${seed}|start`));
  const size = environment.reset.jointNoiseDeg;
  const values = { ...base.values };

  for (const j of model.joints) {
    if (j.robot !== environment.robot) continue;

    const [lo, hi] = j.range ?? [-Infinity, Infinity];

    values[j.id] = Math.max(lo, Math.min(hi, (values[j.id] ?? 0) + (2 * random() - 1) * size));
  }

  return { ...base, values };
}

export function rolloutJudge(input: {
  mj: MainModule;
  model: SimModel;
  controller: Controller;
  environment: Environment;
  start: RobotPoseState;
}): RolloutJudge {
  const { mj, model, controller, environment: env, start } = input;
  const world = new ArenaWorld(mj, model);
  const readers = signalReaders({ mj, engine: world.engine, robot: env.robot }, env.signals);
  const names = Object.keys(readers);
  const ticks = Math.floor(env.horizonS / env.traceDt + 1e-9) + 1;

  const judge: StressJudge = async (point) => {
    world.prepare({ instance: instanceAt(point), controller, start, robot: env.robot });

    const signals: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));

    for (let tick = 0; tick < ticks; tick++) {
      if (tick > 0) world.engine.step(env.traceDt);

      for (const name of names) signals[name].push(readers[name]());
    }

    const diverged = world.diverged();
    const result = await evaluateContract(env.contract, { dt: env.traceDt, signals });

    return stressMargin(result, diverged);
  };

  return { judge, dispose: () => world.dispose() };
}

const offNominal = (point: StressPoint) => STRESS_AXES.filter((a) => point[a] !== NOMINAL[a]).length;

export function stressFindings(axes: AxisResult[], worst: StressRun): StressFinding[] {
  const found = axes
    .filter((a) => a.boundary !== null)
    .map((a): StressFinding => ({
      axis: a.axis,
      side: a.side,
      boundary: a.boundary,
      margin: a.worst.margin,
      point: a.worst.point,
    }));
  const worse = found.every((f) => worst.margin < f.margin);
  const combined: StressFinding[] =
    worst.margin <= 0 && worse && offNominal(worst.point) > 1
      ? [{ axis: 'combined', side: null, boundary: null, margin: worst.margin, point: worst.point }]
      : [];

  return [...combined, ...found].sort((a, b) => a.margin - b.margin).slice(0, MAX_FINDINGS);
}

const randomSeed = () => [...crypto.getRandomValues(new Uint32Array(2))].map((n) => n.toString(16)).join('');

export async function stressSkill(input: StressInput): Promise<StressResult> {
  const { mj, model, skill, environment } = input;
  const budget = input.budget ?? STRESS_BUDGET;
  const seed = input.seed ?? randomSeed();
  const start = stressStart(model, environment, seed);
  const rollouts = input.judge
    ? { judge: input.judge, dispose: () => undefined }
    : rolloutJudge({ mj, model, controller: skill.controller, environment, start });

  try {
    const search = await searchStress({
      judge: rollouts.judge,
      seed,
      budget,
      stop: () => !!input.signal?.aborted,
      onProgress: input.onProgress,
    });

    if (input.signal?.aborted) throw new Error('Stopped.');

    return {
      version: STRESS_VERSION,
      skill: skillHash(skill),
      environment: environmentHash(environment),
      seed,
      start,
      budget,
      ...search,
      findings: stressFindings(search.axes, search.worst),
    };
  } finally {
    rollouts.dispose();
  }
}

const RANDOMIZED: Record<StressAxis, keyof Omit<Randomization, 'servos'>> = {
  friction: 'friction',
  mass: 'mass',
  strength: 'strength',
  latencyMs: 'latencyMs',
};

const covering = (range: Range, axis: StressAxis, value: number): Range => {
  const v = stressPoint({ [axis]: value })[axis];

  return [Math.min(range[0], v), Math.max(range[1], v)];
};

export function widenedEnvironment(environment: Environment, findings: StressFinding[]): Environment {
  const randomization = { ...environment.randomization };

  for (const finding of findings) {
    const axes =
      finding.axis === 'combined' ? STRESS_AXES.filter((a) => finding.point[a] !== NOMINAL[a]) : [finding.axis];

    for (const axis of axes) {
      const key = RANDOMIZED[axis];

      randomization[key] = covering(randomization[key], axis, finding.point[axis]);
    }
  }

  return { ...environment, randomization };
}
