import type { MainModule } from '@mujoco/mujoco';
import { signalReader } from '../../src/skills/arenaSignals';
import type { Formula, State } from '../../src/skills/contract';
import { policyObservation, type Environment, type SignalSource } from '../../src/skills/environment';
import { fixtureModel } from '../../src/skills/fixtureModels';
import type { RaceTask } from '../../src/skills/race';
import type { Method, TaskAnalysis } from '../../src/skills/router';
import { SimEngine } from '../../src/sim/engine';
import type { SimModel } from '../../src/sim/mjcfTypes';
import type { JointValues } from '../../src/types/robotics';
import { judgeEnvironment, robotOf, startHeight, type V3 } from './judge';

export const REACH_TOLERANCE_M = 0.02;
export const SETTLE_S = 2;

export const ALTERNATIVES: readonly Method[] = Object.freeze([
  'ik-or-motion-plan',
  'lqr-or-mpc',
  'tracking-rl-with-reset-curriculum',
  'reward-search',
]);

export const HACKED_REWARD = `
def reward(state):
    upright = exp(-(state.gravity[0] ** 2 + state.gravity[1] ** 2) / 0.05)
    return term("tall", 10.0 * upright * state.control_dt * 10)
`;

const AXES = ['x', 'y', 'z'] as const;

export function partPoint(mj: MainModule, model: SimModel, options: { part: string; values: JointValues }): V3 {
  const engine = new SimEngine(mj, model);

  try {
    engine.setController({ kind: 'hold', values: { ...model.initial.values, ...options.values } });
    engine.step(SETTLE_S);

    const robot = model.robots[0].key;

    return AXES.map((axis) =>
      signalReader({ mj, engine, robot }, { kind: 'part-position', part: options.part, axis })(),
    ) as V3;
  } finally {
    engine.dispose();
  }
}

function near(point: V3): State {
  return {
    all: AXES.flatMap((axis, i) => [
      {
        atom: { expr: { signal: `tip_${axis}` }, cmp: '>' as const, value: point[i] - REACH_TOLERANCE_M, scale: 0.01 },
      },
      {
        atom: { expr: { signal: `tip_${axis}` }, cmp: '<' as const, value: point[i] + REACH_TOLERANCE_M, scale: 0.01 },
      },
    ]),
  };
}

function armEnvironment(model: SimModel, options: { part: string; horizonS: number; success: Formula }): Environment {
  const robot = robotOf(model);
  const tip = Object.fromEntries(
    AXES.map((axis) => [`tip_${axis}`, { kind: 'part-position', part: options.part, axis } as SignalSource]),
  );

  return {
    version: 1,
    robot: robot.key,
    horizonS: options.horizonS,
    traceDt: 0.02,
    observation: policyObservation(robot.joints),
    action: { kind: 'position-offset', joints: robot.joints, scale: 0.25, controlDt: 0.02 },
    reset: { jointNoiseDeg: 1, baseYawDeg: 0, baseOffsetMm: 0 },
    randomization: { friction: [0.8, 1.2], mass: [0.9, 1.1], strength: [0.9, 1], latencyMs: [0, 20] },
    reward: { kind: 'contract-robustness' },
    contract: { version: 1, success: options.success, failures: [] },
    signals: tip,
  };
}

const quasiStatic = (stateDimension: number): TaskAnalysis => ({
  simCanCheck: true,
  quasiStatic: true,
  motionShapeMatters: false,
  kitSkills: null,
  stateDimension,
  contactRich: false,
  trajectoryOptimisation: 'not-tried',
  rewardSearchRounds: 0,
  demo: 'not-asked',
});

export const REACH_POSE: JointValues = { arm0: 35, arm1: -50 };
export const TOUCH_POSE: JointValues = { arm0: 30, arm1: 30, arm3: -40 };
export const HOLD_POSE: JointValues = { arm0: -25, arm1: 45, arm2: 60, arm3: -30 };

export function reachTask(mj: MainModule): RaceTask {
  const model = fixtureModel('arm-3dof');
  const point = partPoint(mj, model, { part: 'link2', values: REACH_POSE });
  const success: Formula = { hold_for: { seconds: 0.5, within: 'whole', state: near(point) } };

  return {
    id: 'arm-3dof-reach',
    design: 'arm-3dof',
    model,
    environment: armEnvironment(model, { part: 'link2', horizonS: 3, success }),
    analysis: quasiStatic(6),
    goal: { kind: 'reach', part: 'link2', waypoints: [{ point, holdS: 0.5 }] },
  };
}

export function touchThenHoldTask(mj: MainModule): RaceTask {
  const model = fixtureModel('arm-6dof');
  const touch = partPoint(mj, model, { part: 'link5', values: TOUCH_POSE });
  const hold = partPoint(mj, model, { part: 'link5', values: HOLD_POSE });
  const success: Formula = {
    sequence: [
      { hold_for: { seconds: 0.1, within: 'whole', state: near(touch) } },
      { hold_for: { seconds: 1, within: 'whole', state: near(hold) } },
    ],
  };

  return {
    id: 'arm-6dof-touch-then-hold',
    design: 'arm-6dof',
    model,
    environment: armEnvironment(model, { part: 'link5', horizonS: 5, success }),
    analysis: quasiStatic(12),
    goal: {
      kind: 'reach',
      part: 'link5',
      waypoints: [
        { point: touch, holdS: 0.1 },
        { point: hold, holdS: 1 },
      ],
    },
  };
}

export const WALK_SPEED = 0.2;

export function walkTask(mj: MainModule): RaceTask {
  const model = fixtureModel('quad-servo');
  const command: V3 = [WALK_SPEED, 0, 0];
  const environment = judgeEnvironment({ model, entry: 'velocity-tracking', height: startHeight(mj, model), command });

  return {
    id: 'quad-servo-walk-0.2',
    design: 'quad-servo',
    model,
    environment,
    analysis: {
      simCanCheck: true,
      quasiStatic: false,
      motionShapeMatters: false,
      kitSkills: null,
      stateDimension: 37,
      contactRich: true,
      trajectoryOptimisation: 'not-tried',
      rewardSearchRounds: 0,
      demo: 'not-asked',
    },
    goal: { kind: 'velocity', command },
  };
}

export interface SuiteTask {
  make: (mj: MainModule) => RaceTask;
  expected: Method;
  budgetMin: number;
}

export const RACE_SUITE: readonly SuiteTask[] = Object.freeze([
  { make: reachTask, expected: 'ik-or-motion-plan', budgetMin: 5 },
  { make: touchThenHoldTask, expected: 'ik-or-motion-plan', budgetMin: 5 },
  { make: walkTask, expected: 'reward-search', budgetMin: 45 },
]);
