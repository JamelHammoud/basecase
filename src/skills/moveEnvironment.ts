import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation, RobotPoseState } from '../types/robotics';
import type { Cmp, Contract, Expr, Formula, NamedFailure, State } from './contract';
import {
  policyObservation,
  withServoSpreads,
  type Environment,
  type MoveReference,
  type SignalSource,
} from './environment';
import { sha256Hex } from './hash';
import { FELL } from './kitEnvironment';
import { KIT_ACTION_SCALE, kitRobot, neutralRad } from './kitModel';
import { moveReward } from './moveRewards';
import { lowestHeight, moveReference, referencePeriodS } from './moveReference';
import { moveTube, outsideTube } from './moveTube';
import type { TaskAnalysis } from './router';

export const MOVE_BARS = Object.freeze({
  toleranceRad: 0.25,
  holdS: 2,
  loopPeriods: 2,
  minHorizonS: 4,
  loopHorizonS: 12,
  driftM: 0.3,
  fellTiltRad: 1,
  fellHeightShare: 0.45,
  canaryShare: 1.5,
  scaleMargin: 1.15,
  maxScale: 3,
});

const TRACE_DT = 0.02;
const R2D = 180 / Math.PI;

const atom = (expr: Expr, cmp: Cmp, value: number, scale: number): State => ({ atom: { expr, cmp, value, scale } });
const signal = (name: string): Expr => ({ signal: name });
const jointSignal = (joint: string) => `q_${joint}`;

export function moveHorizonS(reference: MoveReference): number {
  const period = referencePeriodS(reference);

  if (!reference.loop) return Math.max(MOVE_BARS.minHorizonS, period + MOVE_BARS.holdS);

  const span = Math.min(MOVE_BARS.loopPeriods * period, Math.max(period, MOVE_BARS.loopHorizonS));

  return Math.max(MOVE_BARS.minHorizonS, span);
}

const neutral = (model: SimModel, reference: MoveReference) => reference.joints.map((id) => neutralRad(model, id));

export function moveActionScale(model: SimModel, reference: MoveReference): number {
  const home = neutral(model, reference);
  const reach = Math.max(...reference.frames.flatMap((f) => home.map((h, j) => Math.abs(f[j] - h))));

  return Math.min(MOVE_BARS.maxScale, Math.max(KIT_ACTION_SCALE, reach * MOVE_BARS.scaleMargin));
}

const tubeOf = (reference: MoveReference) =>
  moveTube(reference, { horizonS: moveHorizonS(reference), toleranceRad: MOVE_BARS.toleranceRad });

export const zeroPolicyMiss = (model: SimModel, reference: MoveReference) =>
  outsideTube(tubeOf(reference), neutral(model, reference));

export function moveProblems(model: SimModel, reference: MoveReference): string[] {
  const needed = (MOVE_BARS.canaryShare - 1) * MOVE_BARS.toleranceRad;

  if (zeroPolicyMiss(model, reference) > needed) return [];

  return [`It stays within ${Math.round(MOVE_BARS.canaryShare * MOVE_BARS.toleranceRad * R2D)}° of the rest pose.`];
}

function rootPart(model: SimModel): string | null {
  const { root } = kitRobot(model);

  return model.bodies.find((b) => b.name === root)?.parts[0] ?? null;
}

function moveSignals(model: SimModel, reference: MoveReference): Record<string, SignalSource> {
  const part = rootPart(model);
  const joints = reference.joints.map((joint) => [jointSignal(joint), { kind: 'joint-position', joint }]);
  const place: Record<string, SignalSource> = part
    ? { x: { kind: 'part-position', part, axis: 'x' }, y: { kind: 'part-position', part, axis: 'y' } }
    : { x: { kind: 'base-forward' } };

  return { height: { kind: 'base-height' }, tilt: { kind: 'base-tilt' }, ...place, ...Object.fromEntries(joints) };
}

function fell(reference: MoveReference): NamedFailure {
  const tilt = Math.max(...reference.frames.map((f) => f[reference.joints.length + 1]));
  const state: State = {
    any: [
      atom(signal('tilt'), '>', Math.max(MOVE_BARS.fellTiltRad, tilt + 0.5), 0.1),
      atom(signal('height'), '<', MOVE_BARS.fellHeightShare * lowestHeight(reference), 0.02),
    ],
  };

  return { label: FELL, formula: { eventually: { window: 'whole', state } } };
}

function stays(signals: Record<string, SignalSource>): Formula {
  const near = ['x', 'y']
    .filter((s) => s in signals)
    .map((s) => atom({ abs: { delta: signal(s) } }, '<', MOVE_BARS.driftM, 0.05));

  return { always: { window: 'whole', state: { all: near } } };
}

export function moveContract(model: SimModel, reference: MoveReference): Contract {
  const windows = tubeOf(reference).map(({ from, to, bands }) => ({
    always: {
      window: { from, to },
      state: {
        all: reference.joints.flatMap((j, i) => [
          atom(signal(jointSignal(j)), '>', bands[i][0], 0.05),
          atom(signal(jointSignal(j)), '<', bands[i][1], 0.05),
        ]),
      },
    },
  }));

  return {
    version: 1,
    success: { all: [...windows, stays(moveSignals(model, reference))] },
    failures: [fell(reference)],
  };
}

export function startPose(model: SimModel, reference: MoveReference): RobotPoseState {
  const byId = new Map(model.joints.map((j) => [j.id, j]));
  const first = reference.frames[0];
  const values = { ...model.initial.values };

  reference.joints.forEach((id, j) => {
    values[id] = byId.get(id)?.type === 'prismatic' ? first[j] * 1000 : first[j] * R2D;
  });

  return { ...model.initial, values };
}

export const moveRewardHash = (reference: MoveReference) => sha256Hex(moveReward(reference));

export function moveEnvironment(model: SimModel, animation: RobotAnimation): Environment {
  const robot = kitRobot(model);
  const reference = moveReference(model, animation);

  return withServoSpreads(model, {
    version: 1,
    robot: robot.key,
    horizonS: moveHorizonS(reference),
    traceDt: TRACE_DT,
    observation: [...policyObservation(robot.joints), { kind: 'clock', periodS: referencePeriodS(reference) }],
    action: {
      kind: 'position-offset',
      joints: robot.joints,
      scale: moveActionScale(model, reference),
      controlDt: reference.controlDt,
    },
    reset: { pose: startPose(model, reference), jointNoiseDeg: 1, baseYawDeg: 0, baseOffsetMm: 0 },
    randomization: { friction: [0.8, 1.2], mass: [0.9, 1.1], strength: [0.9, 1], latencyMs: [0, 20] },
    reward: { kind: 'rewardlang', hash: moveRewardHash(reference) },
    contract: moveContract(model, reference),
    signals: moveSignals(model, reference),
    reference,
  });
}

export function moveAnalysis(model: SimModel): TaskAnalysis {
  const robot = model.robots[0];
  const floating = !!robot?.floating;

  return {
    simCanCheck: true,
    quasiStatic: !floating,
    motionShapeMatters: true,
    kitSkills: null,
    stateDimension: 13 + 2 * (robot?.joints.length ?? 0),
    contactRich: floating,
    trajectoryOptimisation: 'not-tried',
    rewardSearchRounds: 0,
    demo: 'not-asked',
  };
}

export function moveAnimations(model: SimModel, animations: readonly RobotAnimation[]): RobotAnimation[] {
  const robot = model.robots[0];

  if (!robot?.floating || robot.morphology !== 'legged') return [];

  const mine = (a: RobotAnimation) =>
    a.robot === robot.key ||
    (!a.robot && Object.keys(a.keyframes[0]?.values ?? {}).some((id) => robot.joints.includes(id)));

  return animations.filter((a) => a.keyframes.length > 1 && mine(a));
}
