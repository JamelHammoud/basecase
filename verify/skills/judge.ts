import type { MainModule } from '@mujoco/mujoco';
import type { Cmp, Contract, Expr, Formula, State } from '../../src/skills/contract';
import { policyObservation, type Environment, type SignalSource } from '../../src/skills/environment';
import { SimEngine } from '../../src/sim/engine';
import type { SimModel } from '../../src/sim/mjcfTypes';
import { obsSize, POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from '../../src/sim/policy';
import type { RobotPoseState } from '../../src/types/robotics';

export type V3 = [number, number, number];
export type JudgedEntry = 'stand' | 'velocity-tracking' | 'get-up' | 'settle-to-neutral';

export const TRACE_DT = 0.02;

export const BARS = Object.freeze({
  standSeconds: 6,
  standStartNoiseDeg: 15,
  standTiltRad: 0.35,
  standHeightShare: 0.75,
  standDriftM: 0.15,
  velocitySeconds: 8,
  rampSeconds: 1,
  walkTiltRad: 0.6,
  walkHeightShare: 0.6,
  slowestShare: 0.5,
  fastestShare: 1.5,
  stillDriftM: 0.1,
  getUpSeconds: 6,
  crouchOffsetDeg: 40,
  collapseSeconds: 2,
  getUpHeightShare: 0.8,
  getUpHoldS: 1,
  settleSeconds: 4,
  settleOffsetDeg: 12,
  settleToleranceDeg: 8,
  settleHoldS: 1,
  fellTiltRad: 1,
  fellHeightShare: 0.45,
});

const D2R = Math.PI / 180;

const atom = (expr: Expr, cmp: Cmp, value: number, scale: number): State => ({ atom: { expr, cmp, value, scale } });
const signal = (name: string): Expr => ({ signal: name });
const travel: Expr = { delta: signal('forward') };
const always = (state: State): Formula => ({ always: { window: 'whole', state } });

export interface JudgedRobot {
  key: string;
  root: string;
  joints: string[];
}

export function robotOf(model: SimModel): JudgedRobot {
  const robot = model.robots[0];
  const joints = model.joints.filter((j) => j.robot === robot.key && j.actuator >= 0 && j.drive === 'position');

  return { key: robot.key, root: robot.root, joints: joints.map((j) => j.id) };
}

function withEngine<T>(mj: MainModule, model: SimModel, read: (engine: SimEngine) => T): T {
  const engine = new SimEngine(mj, model);

  try {
    return read(engine);
  } finally {
    engine.dispose();
  }
}

const bodyId = (mj: MainModule, engine: SimEngine, name: string) =>
  mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, name);

const jointId = (mj: MainModule, engine: SimEngine, name: string) =>
  mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_JOINT.value, name);

export function startHeight(mj: MainModule, model: SimModel): number {
  return withEngine(mj, model, (engine) => engine.data.xpos[bodyId(mj, engine, model.robots[0].root) * 3 + 2]);
}

function jointValue(type: 'revolute' | 'prismatic', qpos: number) {
  return type === 'revolute' ? qpos / D2R : qpos * 1000;
}

export function offsetPose(model: SimModel, degrees: number): RobotPoseState {
  const values = { ...model.initial.values };

  robotOf(model).joints.forEach((id, i) => {
    values[id] = (values[id] ?? 0) + (i % 2 ? -1 : 1) * degrees;
  });

  return { ...model.initial, values };
}

export const perturbedPose = (model: SimModel) => offsetPose(model, BARS.settleOffsetDeg);

export function pronePose(mj: MainModule, model: SimModel): RobotPoseState {
  const robot = model.robots[0];

  return withEngine(mj, model, (engine) => {
    engine.setController({ kind: 'limp' });
    engine.reset(offsetPose(model, BARS.crouchOffsetDeg));
    engine.step(BARS.collapseSeconds);

    const values = { ...model.initial.values };

    for (const j of model.joints.filter((x) => x.robot === robot.key)) {
      values[j.id] = jointValue(j.type, engine.data.qpos[engine.model.jnt_qposadr[jointId(mj, engine, j.name)]]);
    }

    const at = engine.model.jnt_qposadr[jointId(mj, engine, robot.root)] + 2;
    const lift = (engine.data.qpos[at] - engine.model.qpos0[at]) * 1000;

    return { ...model.initial, values, roots: { ...model.initial.roots, [robot.key]: { position: [0, lift, 0] } } };
  });
}

const neutralRad = (model: SimModel, id: string) => (model.initial.values[id] ?? 0) * D2R;

function upright(height: number, share: number, tiltRad: number): State {
  return { all: [atom(signal('tilt'), '<', tiltRad, 0.1), atom(signal('height'), '>', share * height, 0.02)] };
}

function fellFailure(height: number) {
  return {
    label: 'fell',
    formula: {
      eventually: {
        window: 'whole' as const,
        state: {
          any: [
            atom(signal('tilt'), '>', BARS.fellTiltRad, 0.1),
            atom(signal('height'), '<', BARS.fellHeightShare * height, 0.02),
          ],
        },
      },
    },
  };
}

function standContract(height: number): Formula {
  return {
    all: [
      always(upright(height, BARS.standHeightShare, BARS.standTiltRad)),
      always(atom({ abs: travel }, '<', BARS.standDriftM, 0.05)),
    ],
  };
}

function velocityContract(height: number, speed: number): Formula {
  const T = BARS.velocitySeconds;
  const end = { from: T - BARS.rampSeconds, to: T };
  const steady = always(upright(height, BARS.walkHeightShare, BARS.walkTiltRad));

  if (speed === 0) return { all: [steady, always(atom({ abs: travel }, '<', BARS.stillDriftM, 0.05))] };

  return {
    all: [
      steady,
      { eventually: { window: end, state: atom(travel, '>', BARS.slowestShare * speed * (T - 1), 0.1) } },
      { always: { window: end, state: atom(travel, '<', BARS.fastestShare * speed * T + 0.05, 0.1) } },
    ],
  };
}

function getUpContract(height: number): Formula {
  return {
    hold_for: {
      seconds: BARS.getUpHoldS,
      within: 'whole',
      state: upright(height, BARS.getUpHeightShare, BARS.standTiltRad),
    },
  };
}

function settleContract(model: SimModel, height: number): Formula {
  const tol = BARS.settleToleranceDeg * D2R;
  const near = robotOf(model).joints.flatMap((id) => [
    atom(signal(`q_${id}`), '>', neutralRad(model, id) - tol, 0.02),
    atom(signal(`q_${id}`), '<', neutralRad(model, id) + tol, 0.02),
  ]);

  return {
    all: [
      always(upright(height, BARS.walkHeightShare, BARS.standTiltRad)),
      { hold_for: { seconds: BARS.settleHoldS, within: 'whole', state: { all: near } } },
    ],
  };
}

export interface JudgeInput {
  model: SimModel;
  entry: JudgedEntry;
  height: number;
  command?: V3;
  start?: RobotPoseState;
}

const HORIZON: Record<JudgedEntry, number> = {
  stand: BARS.standSeconds,
  'velocity-tracking': BARS.velocitySeconds,
  'get-up': BARS.getUpSeconds,
  'settle-to-neutral': BARS.settleSeconds,
};

function successFor(input: JudgeInput): Formula {
  const { model, entry, height } = input;

  if (entry === 'stand') return standContract(height);

  if (entry === 'velocity-tracking') return velocityContract(height, input.command?.[0] ?? 0);

  if (entry === 'get-up') return getUpContract(height);

  return settleContract(model, height);
}

export function judgeContract(input: JudgeInput): Contract {
  const failures = input.entry === 'get-up' ? [] : [fellFailure(input.height)];

  return { version: 1, success: successFor(input), failures };
}

function judgeSignals(model: SimModel): Record<string, SignalSource> {
  const joints = robotOf(model).joints.map((id) => [`q_${id}`, { kind: 'joint-position', joint: id } as SignalSource]);

  return {
    height: { kind: 'base-height' },
    tilt: { kind: 'base-tilt' },
    forward: { kind: 'base-forward' },
    ...Object.fromEntries(joints),
  };
}

const startNoise = (entry: JudgedEntry) => (entry === 'stand' ? BARS.standStartNoiseDeg : 1);

export function judgeEnvironment(input: JudgeInput): Environment {
  const robot = robotOf(input.model);

  return {
    version: 1,
    robot: robot.key,
    horizonS: HORIZON[input.entry],
    traceDt: TRACE_DT,
    observation: policyObservation(robot.joints),
    action: { kind: 'position-offset', joints: robot.joints, scale: 0.25, controlDt: 0.02 },
    reset: { pose: input.start, jointNoiseDeg: startNoise(input.entry), baseYawDeg: 0, baseOffsetMm: 0 },
    randomization: { friction: [0.8, 1.2], mass: [0.9, 1.1], strength: [0.9, 1], latencyMs: [0, 20] },
    reward: { kind: 'contract-robustness' },
    contract: judgeContract(input),
    signals: judgeSignals(input.model),
  };
}

export function zeroPolicy(model: SimModel, command: V3): PolicySpec {
  const robot = robotOf(model);
  const n = robot.joints.length;
  const size = obsSize(n);

  return {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'walk',
    robot: robot.key,
    joints: robot.joints,
    defaultPose: robot.joints.map((id) => neutralRad(model, id)),
    actionScale: 0.25,
    controlDt: 0.02,
    command,
    obsMean: new Array<number>(size).fill(0),
    obsStd: new Array<number>(size).fill(1),
    layers: [{ in: size, out: n, w: new Array<number>(size * n).fill(0), b: new Array<number>(n).fill(0) }],
    activation: 'elu',
    trainedSteps: 0,
    mujoco: 'none',
    createdAt: '2026-11-07T00:00:00.000Z',
  };
}
