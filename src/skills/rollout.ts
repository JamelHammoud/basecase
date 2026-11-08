import type { MainModule } from '@mujoco/mujoco';
import type { Controller } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import { signalReaders } from './arenaSignals';
import { ArenaWorld, type Instance } from './arenaWorld';
import { evaluateContract, type ContractResult } from './contract';
import type { Environment } from './environment';

export interface Rollout extends ContractResult {
  label: string;
  diverged: boolean;
}

function nominal(world: ArenaWorld): Instance {
  return {
    friction: 1,
    masses: Array.from({ length: world.engine.model.nbody - 1 }, () => 1),
    strength: 1,
    latencyMs: 0,
    jointNoise: world.engine.sim.joints.map(() => 0),
    yawDeg: 0,
    offsetMm: [0, 0],
  };
}

export async function judgeRollout(options: {
  mj: MainModule;
  model: SimModel;
  environment: Environment;
  controller: Controller;
  label: string;
}): Promise<Rollout> {
  const { mj, model, environment: env, controller, label } = options;
  const world = new ArenaWorld(mj, model);

  try {
    const readers = signalReaders({ mj, engine: world.engine, robot: env.robot }, env.signals);
    const names = Object.keys(readers);
    const signals: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
    const ticks = Math.floor(env.horizonS / env.traceDt + 1e-9) + 1;

    world.prepare({ instance: nominal(world), controller, start: env.reset.pose ?? model.initial, robot: env.robot });

    for (let tick = 0; tick < ticks; tick++) {
      if (tick > 0) world.engine.step(env.traceDt);

      for (const name of names) signals[name].push(readers[name]());
    }

    const result = await evaluateContract(env.contract, { dt: env.traceDt, signals });
    const diverged = world.diverged();

    return { ...result, passed: result.passed && !diverged, label, diverged };
  } finally {
    world.dispose();
  }
}
