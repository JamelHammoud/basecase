import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { PhysicsScales } from '../sim/physicsScales';
import type { RobotAnimation, RobotPoseState } from '../types/robotics';
import { signalReaders } from './arenaSignals';
import { ArenaWorld } from './arenaWorld';
import type { SkillController } from './artifacts';
import type { Contract } from './contract';
import { policyObservation, type Environment, type SignalSource } from './environment';
import { kitRobot } from './kitModel';

export interface Plant {
  model: SimModel;
  controller: SkillController;
  start: RobotPoseState;
  signal: SignalSource;
  horizonS: number;
  window: { from: number; to: number };
}

export function plantEnvironment(plant: Plant, contract: Contract): Environment {
  const robot = plant.model.robots[0];
  const joints = robot.joints;

  return {
    version: 1,
    robot: robot.key,
    horizonS: plant.horizonS,
    traceDt: 0.02,
    observation: policyObservation(joints),
    action: { kind: 'position-offset', joints, scale: 0.5, controlDt: 0.02 },
    reset: { pose: plant.start, jointNoiseDeg: 0, baseYawDeg: 0, baseOffsetMm: 0 },
    randomization: { friction: [1, 1], mass: [1, 1], strength: [1, 1], latencyMs: [0, 0] },
    reward: { kind: 'contract-robustness' },
    contract,
    signals: { x: plant.signal },
  };
}

export type Extreme = 'max' | 'min';

export async function plantedValue(
  mj: MainModule,
  plant: Plant,
  options: { point: PhysicsScales; pick: Extreme },
): Promise<number> {
  const { point, pick } = options;
  const world = new ArenaWorld(mj, plant.model);
  const robot = plant.model.robots[0].key;

  try {
    const read = signalReaders({ mj, engine: world.engine, robot }, { x: plant.signal }).x;
    const ticks = Math.round(plant.window.to / 0.02);
    let found = pick === 'max' ? -Infinity : Infinity;

    world.prepare({
      instance: {
        ...point,
        masses: new Array<number>(world.engine.model.nbody - 1).fill(point.mass),
        jointNoise: new Array<number>(world.engine.sim.joints.length).fill(0),
        yawDeg: 0,
        offsetMm: [0, 0],
      },
      controller: plant.controller,
      start: plant.start,
      robot,
    });

    for (let tick = 1; tick <= ticks; tick++) {
      world.engine.step(0.02);

      if (tick * 0.02 >= plant.window.from - 1e-9) found = Math[pick](found, Math.abs(read()));
    }

    return found;
  } finally {
    world.dispose();
  }
}

export function plantContract(plant: Plant, options: { bar: number; pick: Extreme }): Contract {
  const { bar, pick } = options;

  return {
    version: 1,
    success: {
      always: {
        window: plant.window,
        state: {
          atom: {
            expr: { abs: { signal: 'x' } },
            cmp: pick === 'max' ? '<' : '>',
            value: bar,
            scale: Math.abs(bar) * 0.1,
          },
        },
      },
    },
    failures: [],
  };
}

export function rampAnimation(joint: string, degrees: number): RobotAnimation {
  return {
    id: 'ramp',
    name: 'Ramp',
    duration: 2,
    loop: false,
    interpolation: 'linear',
    keyframes: [
      { t: 0, values: { [joint]: 0 } },
      { t: 0.5, values: { [joint]: 0 } },
      { t: 1.5, values: { [joint]: degrees } },
    ],
  };
}

export function shuffleAnimation(model: SimModel, degrees: number): RobotAnimation {
  const swing = kitRobot(model).joints.filter((id) => id.endsWith('swing'));
  const pose = (deg: number) => ({
    ...model.initial.values,
    ...Object.fromEntries(swing.map((id) => [id, (model.initial.values[id] ?? 0) + deg])),
  });

  return {
    id: 'shuffle',
    name: 'Shuffle',
    duration: 0.7,
    loop: true,
    interpolation: 'linear',
    keyframes: [
      { t: 0, values: pose(-degrees) },
      { t: 0.6, values: pose(degrees) },
      { t: 0.7, values: pose(-degrees) },
    ],
  };
}
