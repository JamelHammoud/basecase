import type { SimModel } from '../sim/mjcfTypes';
import type { Cmp, Contract, Expr, Formula, State } from './contract';
import { policyObservation, type Environment, type ResetDistribution, type SignalSource } from './environment';
import { sha256Hex } from './hash';
import { KIT_ACTION_SCALE, kitRobot, kitTopSpeed, neutralRad, offsetPose, rootHeight, type V3 } from './kitModel';
import { kitReward } from './kitRewards';

export type KitEntry = 'stand' | 'get-up' | 'velocity-tracking' | 'pose-tracking' | 'settle-to-neutral';
export type TrainedEntry = Exclude<KitEntry, 'pose-tracking'>;

export const LEGGED_ENTRIES: readonly TrainedEntry[] = Object.freeze([
  'stand',
  'velocity-tracking',
  'get-up',
  'settle-to-neutral',
]);

export const KIT_BARS = Object.freeze({
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
const TRACE_DT = 0.02;
const CONTROL_DT = 0.02;

const atom = (expr: Expr, cmp: Cmp, value: number, scale: number): State => ({ atom: { expr, cmp, value, scale } });
const signal = (name: string): Expr => ({ signal: name });
const travel: Expr = { delta: signal('forward') };
const always = (state: State): Formula => ({ always: { window: 'whole', state } });

const upright = (height: number, share: number, tiltRad: number): State => ({
  all: [atom(signal('tilt'), '<', tiltRad, 0.1), atom(signal('height'), '>', share * height, 0.02)],
});

const fell = (height: number) => ({
  label: 'fell',
  formula: {
    eventually: {
      window: 'whole' as const,
      state: {
        any: [
          atom(signal('tilt'), '>', KIT_BARS.fellTiltRad, 0.1),
          atom(signal('height'), '<', KIT_BARS.fellHeightShare * height, 0.02),
        ],
      },
    },
  },
});

function velocityFormula(height: number, speed: number): Formula {
  const T = KIT_BARS.velocitySeconds;
  const end = { from: T - KIT_BARS.rampSeconds, to: T };
  const steady = always(upright(height, KIT_BARS.walkHeightShare, KIT_BARS.walkTiltRad));

  if (speed === 0) return { all: [steady, always(atom({ abs: travel }, '<', KIT_BARS.stillDriftM, 0.05))] };

  return {
    all: [
      steady,
      { eventually: { window: end, state: atom(travel, '>', KIT_BARS.slowestShare * speed * (T - 1), 0.1) } },
      { always: { window: end, state: atom(travel, '<', KIT_BARS.fastestShare * speed * T + 0.05, 0.1) } },
    ],
  };
}

function settleFormula(model: SimModel, height: number): Formula {
  const tol = KIT_BARS.settleToleranceDeg * D2R;
  const near = kitRobot(model).joints.flatMap((id) => [
    atom(signal(`q_${id}`), '>', neutralRad(model, id) - tol, 0.02),
    atom(signal(`q_${id}`), '<', neutralRad(model, id) + tol, 0.02),
  ]);

  return {
    all: [
      always(upright(height, KIT_BARS.walkHeightShare, KIT_BARS.standTiltRad)),
      { hold_for: { seconds: KIT_BARS.settleHoldS, within: 'whole', state: { all: near } } },
    ],
  };
}

function successFor(model: SimModel, entry: TrainedEntry, height: number): Formula {
  if (entry === 'velocity-tracking') return velocityFormula(height, kitTopSpeed(model));

  if (entry === 'get-up')
    return {
      hold_for: {
        seconds: KIT_BARS.getUpHoldS,
        within: 'whole',
        state: upright(height, KIT_BARS.getUpHeightShare, KIT_BARS.standTiltRad),
      },
    };

  if (entry === 'settle-to-neutral') return settleFormula(model, height);

  return {
    all: [
      always(upright(height, KIT_BARS.standHeightShare, KIT_BARS.standTiltRad)),
      always(atom({ abs: travel }, '<', KIT_BARS.standDriftM, 0.05)),
    ],
  };
}

export function kitSpeedContract(model: SimModel, speed: number): Contract {
  const height = rootHeight(model);

  return { version: 1, success: velocityFormula(height, speed), failures: [fell(height)] };
}

export function kitContract(model: SimModel, entry: TrainedEntry): Contract {
  const height = rootHeight(model);

  return {
    version: 1,
    success: successFor(model, entry, height),
    failures: entry === 'get-up' ? [] : [fell(height)],
  };
}

const HORIZON: Record<TrainedEntry, number> = {
  stand: KIT_BARS.standSeconds,
  'velocity-tracking': KIT_BARS.velocitySeconds,
  'get-up': KIT_BARS.getUpSeconds,
  'settle-to-neutral': KIT_BARS.settleSeconds,
};

function resetFor(model: SimModel, entry: TrainedEntry): ResetDistribution {
  const still = { jointNoiseDeg: 1, baseYawDeg: 0, baseOffsetMm: 0 };

  if (entry === 'stand') return { ...still, jointNoiseDeg: KIT_BARS.standStartNoiseDeg };

  if (entry === 'get-up') return { ...still, pose: offsetPose(model, KIT_BARS.crouchOffsetDeg) };

  if (entry === 'settle-to-neutral') return { ...still, pose: offsetPose(model, KIT_BARS.settleOffsetDeg) };

  return still;
}

function signalsFor(model: SimModel, entry: TrainedEntry): Record<string, SignalSource> {
  const base: Record<string, SignalSource> = {
    height: { kind: 'base-height' },
    tilt: { kind: 'base-tilt' },
    forward: { kind: 'base-forward' },
  };

  if (entry !== 'settle-to-neutral') return base;

  const joints = kitRobot(model).joints.map((id) => [`q_${id}`, { kind: 'joint-position', joint: id } as SignalSource]);

  return { ...base, ...Object.fromEntries(joints) };
}

export const kitCommand = (model: SimModel, entry: TrainedEntry): V3 =>
  entry === 'velocity-tracking' ? [kitTopSpeed(model), 0, 0] : [0, 0, 0];

export const kitRewardHash = (model: SimModel, entry: TrainedEntry) => sha256Hex(kitReward(model, entry));

export function trainedEntry(entry: KitEntry): TrainedEntry {
  if (entry === 'pose-tracking') throw new Error('Pose tracking isn’t in the Motor Kit. Its entries are for legs.');

  return entry;
}

export function kitEnvironment(model: SimModel, entry: KitEntry): Environment {
  const trained = trainedEntry(entry);
  const robot = kitRobot(model);

  return {
    version: 1,
    robot: robot.key,
    horizonS: HORIZON[trained],
    traceDt: TRACE_DT,
    observation: policyObservation(robot.joints),
    action: { kind: 'position-offset', joints: robot.joints, scale: KIT_ACTION_SCALE, controlDt: CONTROL_DT },
    reset: resetFor(model, trained),
    randomization: { friction: [0.8, 1.2], mass: [0.9, 1.1], strength: [0.9, 1], latencyMs: [0, 20] },
    reward: { kind: 'rewardlang', hash: kitRewardHash(model, trained) },
    contract: kitContract(model, trained),
    signals: signalsFor(model, trained),
  };
}
