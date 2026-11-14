import type { MainModule } from '@mujoco/mujoco';
import type { Controller } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotPoseState } from '../types/robotics';
import { signalReaders } from './arenaSignals';
import { ArenaWorld, type Instance } from './arenaWorld';
import { evaluateContract } from './contract';
import type { Environment } from './environment';
import { sha256Hex } from './hash';
import { seededRandom } from '../utils/seededRandom';

export const STRESS_AXES = ['friction', 'mass', 'strength', 'latencyMs'] as const;

export type StressAxis = (typeof STRESS_AXES)[number];

export type StressRun = Record<StressAxis, number>;

export const NOMINAL_RUN: Readonly<StressRun> = Object.freeze({ friction: 1, mass: 1, strength: 1, latencyMs: 0 });

export type StressProbe = (run: StressRun) => Promise<number>;

export interface StressBench {
  probe: StressProbe;
  dispose: () => void;
}

export interface BenchInput {
  mj: MainModule;
  model: SimModel;
  controller: Controller;
  environment: Environment;
  start: RobotPoseState;
}

const MARGIN_FLOOR = -10;

export function stressInstance(run: StressRun, size: { bodies: number; joints: number }): Instance {
  return {
    friction: run.friction,
    masses: new Array<number>(size.bodies).fill(run.mass),
    strength: run.strength,
    latencyMs: run.latencyMs,
    jointNoise: new Array<number>(size.joints).fill(0),
    yawDeg: 0,
    offsetMm: [0, 0],
  };
}

export function stressStart(model: SimModel, environment: Environment, seed: string): RobotPoseState {
  const random = seededRandom(sha256Hex(`stress-start|${seed}`));
  const base = environment.reset.pose ?? model.initial;
  const noise = environment.reset.jointNoiseDeg;
  const values = { ...base.values };

  for (const joint of model.joints) {
    const offset = (2 * random() - 1) * noise;

    if (joint.robot !== environment.robot) continue;

    const [lo, hi] = joint.range ?? [-Infinity, Infinity];

    values[joint.id] = Math.max(lo, Math.min(hi, (values[joint.id] ?? 0) + offset));
  }

  return { ...base, values };
}

export function stressMargin(result: { passed: boolean; margin: number }, diverged: boolean): number {
  if (diverged || !Number.isFinite(result.margin)) return MARGIN_FLOOR;

  const margin = Math.max(MARGIN_FLOOR, result.margin);

  return result.passed ? margin : Math.min(margin, 0);
}

function trace(world: ArenaWorld, input: BenchInput) {
  const { horizonS, traceDt, signals: sources, robot } = input.environment;
  const readers = signalReaders({ mj: input.mj, engine: world.engine, robot }, sources);
  const names = Object.keys(readers);
  const signals: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
  const ticks = Math.floor(horizonS / traceDt + 1e-9) + 1;

  for (let tick = 0; tick < ticks; tick++) {
    if (tick > 0) world.engine.step(traceDt);

    for (const name of names) signals[name].push(readers[name]());
  }

  return signals;
}

export function stressBench(input: BenchInput): StressBench {
  const world = new ArenaWorld(input.mj, input.model);
  const size = { bodies: world.engine.model.nbody - 1, joints: world.engine.sim.joints.length };
  const { environment } = input;

  const probe = async (run: StressRun) => {
    world.prepare({
      instance: stressInstance(run, size),
      controller: input.controller,
      start: input.start,
      robot: environment.robot,
    });

    const signals = trace(world, input);
    const diverged = world.diverged();
    const result = await evaluateContract(environment.contract, { dt: environment.traceDt, signals });

    return stressMargin(result, diverged);
  };

  return { probe, dispose: () => world.dispose() };
}
