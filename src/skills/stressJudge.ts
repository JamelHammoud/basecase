import type { MainModule } from '@mujoco/mujoco';
import type { Controller } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import { signalReaders } from './arenaSignals';
import { ArenaWorld, seededRandom, startPose, type Instance } from './arenaWorld';
import { evaluateContract, type ContractResult } from './contract';
import type { Environment } from './environment';
import { sha256Hex } from './hash';

export type StressAxis = 'friction' | 'mass' | 'strength' | 'latencyMs';

export type StressPoint = Record<StressAxis, number>;

export type StressJudge = (point: StressPoint) => Promise<number>;

export const NOMINAL: Readonly<StressPoint> = Object.freeze({ friction: 1, mass: 1, strength: 1, latencyMs: 0 });

export function stressInstance(point: StressPoint, jointNoise: number[]): Instance {
  return {
    friction: point.friction,
    masses: [point.mass],
    strength: point.strength,
    latencyMs: point.latencyMs,
    jointNoise,
    yawDeg: 0,
    offsetMm: [0, 0],
  };
}

export function stressStart(model: SimModel, options: { environment: Environment; seed: string }): number[] {
  const random = seededRandom(sha256Hex(`stress|${options.seed}|start`));
  const size = options.environment.reset.jointNoiseDeg;

  return model.joints.map(() => Number(((2 * random() - 1) * size).toFixed(3)));
}

export const stressStartPose = (model: SimModel, options: { environment: Environment; start: number[] }) =>
  startPose(model.joints, {
    base: options.environment.reset.pose ?? model.initial,
    instance: { jointNoise: options.start, offsetMm: [0, 0] },
    robot: options.environment.robot,
  });

const FAILED = 1e-3;

export function signedMargin(result: ContractResult, diverged: boolean): number {
  if (diverged) return Math.min(result.margin, -1);

  return result.passed ? Math.max(result.margin, FAILED) : Math.min(result.margin, -FAILED);
}

export interface PhysicsJudgeInput {
  mj: MainModule;
  model: SimModel;
  environment: Environment;
  controller: Controller;
  start: number[];
}

export function physicsJudge(input: PhysicsJudgeInput): { judge: StressJudge; dispose: () => void } {
  const { mj, model, environment: env, controller, start } = input;
  const world = new ArenaWorld(mj, model);
  const readers = signalReaders({ mj, engine: world.engine, robot: env.robot }, env.signals);
  const names = Object.keys(readers);
  const ticks = Math.floor(env.horizonS / env.traceDt + 1e-9) + 1;

  const judge: StressJudge = async (point) => {
    const signals: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));

    world.prepare({
      instance: stressInstance(point, start),
      controller,
      start: env.reset.pose ?? model.initial,
      robot: env.robot,
    });

    for (let tick = 0; tick < ticks; tick++) {
      if (tick > 0) world.engine.step(env.traceDt);

      for (const name of names) signals[name].push(readers[name]());
    }

    const result = await evaluateContract(env.contract, { dt: env.traceDt, signals });

    return signedMargin(result, world.diverged());
  };

  return { judge, dispose: () => world.dispose() };
}
