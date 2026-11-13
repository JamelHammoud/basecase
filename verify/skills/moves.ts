import fs from 'node:fs';
import path from 'node:path';
import type { MainModule } from '@mujoco/mujoco';
import { runArena } from '../../src/skills/arena';
import { signalReaders } from '../../src/skills/arenaSignals';
import { ArenaWorld, type Instance } from '../../src/skills/arenaWorld';
import type { Environment } from '../../src/skills/environment';
import { caseModel, robotName, type MoveCase } from '../../src/skills/moveCases';
import { moveEnvironment } from '../../src/skills/moveEnvironment';
import { trainMove } from '../../src/skills/moves';
import type { Controller } from '../../src/sim/engine';
import type { SimModel } from '../../src/sim/mjcfTypes';
import { forgeRunner } from './forge';
import { KIT_OUT, skillStore, writeJson } from './plans';

export const MOVES_OUT = path.join(path.dirname(KIT_OUT), 'moves');

export async function trainCase(mj: MainModule, c: MoveCase) {
  const dir = path.join(MOVES_OUT, c.id);

  fs.rmSync(dir, { recursive: true, force: true });

  const model = caseModel(c);
  const forge = forgeRunner(path.join(dir, 'runs'));
  const store = skillStore(path.join(dir, 'store'));
  const { outcome, environment } = await trainMove({
    mj,
    design: robotName(c),
    model,
    animation: c.animation,
    forge: forge.run,
    save: store.save,
  });

  writeJson(dir, 'outcome.json', outcome);
  writeJson(dir, 'environment.json', environment);

  return { model, outcome, environment, forge, store, dir };
}

export async function rejudge(options: { mj: MainModule; c: MoveCase; controller: Controller }) {
  const { mj, c, controller } = options;
  const model = caseModel(c);
  const environment = moveEnvironment(model, c.animation);

  return runArena({ mj, model, contract: environment.contract, controller, environment });
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

export function finalJoints(options: {
  mj: MainModule;
  model: SimModel;
  environment: Environment;
  controller: Controller;
}): number[] {
  const { mj, model, environment: env, controller } = options;
  const world = new ArenaWorld(mj, model);

  try {
    const joints = env.reference!.joints;
    const sources = Object.fromEntries(joints.map((joint) => [joint, { kind: 'joint-position' as const, joint }]));
    const readers = signalReaders({ mj, engine: world.engine, robot: env.robot }, sources);
    const ticks = Math.floor(env.horizonS / env.traceDt + 1e-9);

    world.prepare({ instance: nominal(world), controller, start: env.reset.pose ?? model.initial, robot: env.robot });

    for (let tick = 0; tick < ticks; tick++) world.engine.step(env.traceDt);

    return joints.map((joint) => readers[joint]());
  } finally {
    world.dispose();
  }
}
