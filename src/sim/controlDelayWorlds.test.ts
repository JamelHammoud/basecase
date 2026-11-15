import loadMujoco, { type MainModule, type MjData, type MjModel } from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { ArenaWorld } from '../skills/arenaWorld';
import { fixtureModel } from '../skills/fixtureModels';
import { SimEngine } from './engine';
import { LivePhysics } from './livePhysics';

const model = fixtureModel('arm-3dof');

function liveWorld(mj: MainModule) {
  const physics = new LivePhysics();
  const engine = new SimEngine(physics.module(mj), model);

  physics.attach(engine);

  return {
    engine,
    prepare: (latencyMs: number | null) => {
      physics.apply(mj, latencyMs === null ? null : { friction: 1, mass: 1, strength: 1, latencyMs });

      return physics.applied()?.latencyMs ?? 0;
    },
  };
}

function arenaWorld(mj: MainModule) {
  const world = new ArenaWorld(mj, model);

  return {
    engine: world.engine,
    prepare: (latencyMs: number | null) => {
      world.prepare({
        instance: {
          friction: 1,
          masses: [1],
          strength: 1,
          latencyMs: latencyMs ?? 0,
          jointNoise: [],
          yawDeg: 0,
          offsetMm: [0, 0],
        },
        controller: { kind: 'hold' },
        start: model.initial,
        robot: model.robots[0].key,
      });

      return Math.round((latencyMs ?? 0) / 1000 / world.engine.dt) * world.engine.dt * 1000;
    },
  };
}

function recordSteps(mj: MainModule, seen: number[][]): MainModule {
  const step = (compiled: MjModel, data: MjData) => {
    seen.push(Array.from(data.ctrl));
    mj.mj_step(compiled, data);
  };

  return Object.create(mj, { mj_step: { value: step } }) as MainModule;
}

function checkCommands(engine: SimEngine, seen: number[][], steps: number, phase: number) {
  const commands: number[][] = [];

  for (let tick = 0; tick < 90; tick++) {
    const values = Object.fromEntries(model.joints.map((joint, i) => [joint.id, phase + Math.sin(tick + i) * 5]));
    const command = Array.from({ length: engine.model.nu }, () => 0);

    for (const joint of model.joints) command[joint.actuator] = (values[joint.id] * Math.PI) / 180;

    commands.push(command);
    engine.setController({ kind: 'hold', values });
    engine.step(engine.dt);
    expect(seen.at(-1)).toEqual(commands[Math.max(0, tick - steps)].map((value) => expect.closeTo(value, 14)));
  }
}

describe('latency in WASM physics worlds', () => {
  it.each([
    ['live simulation', liveWorld],
    ['Arena', arenaWorld],
  ] as const)('delays actual MuJoCo controls and clears history between %s runs', async (_, create) => {
    const mj = await loadMujoco();
    const seen: number[][] = [];
    const world = create(recordSteps(mj, seen));
    const { engine } = world;

    try {
      for (const [phase, steps] of [4, 2, 0, 6, 6].entries()) {
        const latencyMs = steps ? (steps + 0.2) * engine.dt * 1000 : null;

        expect(world.prepare(latencyMs)).toBeCloseTo(steps * engine.dt * 1000, 10);
        checkCommands(engine, seen, steps, phase * 10);
      }

      expect(seen).toHaveLength(450);
    } finally {
      engine.dispose();
    }
  });
});
