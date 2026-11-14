import type { ServoSpread, SimModel } from '../sim/mjcfTypes';
import type { RobotPoseState } from '../types/robotics';
import { contractSignals, type Contract } from './contract';
import { canonicalJson, hashOf, isHash } from './hash';
import { eyeProblems, eyeRays, type Eye } from '../sim/eyes';
import { errorMessage } from '../utils/errorMessage';
import { plural } from '../../electron/plural.mjs';
import { robotSpreads } from './servoDraws';

export type { ServoSpread } from '../sim/mjcfTypes';

export const ENVIRONMENT_VERSION = 2;
export const ENVIRONMENT_VERSIONS = [1, ENVIRONMENT_VERSION] as const;

export type EnvironmentVersion = (typeof ENVIRONMENT_VERSIONS)[number];

export type Range = [number, number];
export type Axis = 'x' | 'y' | 'z';

export type ObservationTerm =
  | { kind: 'base-gravity' }
  | { kind: 'base-angular-velocity' }
  | { kind: 'base-linear-velocity' }
  | { kind: 'command'; size: number }
  | { kind: 'joint-positions'; joints: string[] }
  | { kind: 'joint-velocities'; joints: string[] }
  | { kind: 'last-action' }
  | { kind: 'clock'; periodS: number }
  | { kind: 'depth-eye'; eye: Eye };

export interface ActionSpec {
  kind: 'position-offset' | 'velocity';
  joints: string[];
  scale: number;
  controlDt: number;
}

export interface StartArea {
  forwardM: Range;
  sideM: Range;
}

export interface SkillState {
  joints: number[];
  jointVels: number[];
  height: number;
  quat: [number, number, number, number];
  linear: [number, number, number];
  angular: [number, number, number];
}

export interface SkillStates {
  skill: string;
  joints: string[];
  samples: SkillState[];
}

export interface ResetDistribution {
  pose?: RobotPoseState;
  jointNoiseDeg: number;
  baseYawDeg: number;
  baseOffsetMm: number;
  startArea?: StartArea;
  states?: SkillStates;
}

export const MAX_START_STATES = 256;

export interface Randomization {
  friction: Range;
  mass: Range;
  strength: Range;
  latencyMs: Range;
  servos?: ServoSpread[];
}

export type RewardRef = { kind: 'contract-robustness' } | { kind: 'rewardlang'; hash: string };

export type SignalSource =
  | { kind: 'time' }
  | { kind: 'joint-position'; joint: string }
  | { kind: 'joint-velocity'; joint: string }
  | { kind: 'joint-effort'; joint: string }
  | { kind: 'part-position'; part: string; axis: Axis }
  | { kind: 'base-height' }
  | { kind: 'base-tilt' }
  | { kind: 'base-forward' }
  | { kind: 'contact'; part: string; with: string | 'floor' };

export interface MoveReference {
  joints: string[];
  controlDt: number;
  loop: boolean;
  frames: number[][];
}

export const MAX_REFERENCE_FRAMES = 30000;

export interface Environment {
  version: EnvironmentVersion;
  robot: string;
  horizonS: number;
  traceDt: number;
  observation: ObservationTerm[];
  action: ActionSpec;
  reset: ResetDistribution;
  randomization: Randomization;
  reward: RewardRef;
  contract: Contract;
  signals: Record<string, SignalSource>;
  reference?: MoveReference;
}

export const MAX_HORIZON_S = 600;
export const MAX_LATENCY_MS = 500;

const TERM_SIZE: Record<ObservationTerm['kind'], (term: ObservationTerm, action: ActionSpec) => number> = {
  'base-gravity': () => 3,
  'base-angular-velocity': () => 3,
  'base-linear-velocity': () => 3,
  command: (t) => (t as { size: number }).size,
  'joint-positions': (t) => (t as { joints: string[] }).joints.length,
  'joint-velocities': (t) => (t as { joints: string[] }).joints.length,
  'last-action': (_, action) => action.joints.length,
  clock: () => 2,
  'depth-eye': (t) => eyeRays((t as { eye: Eye }).eye),
};

export const observationSize = (env: Pick<Environment, 'observation' | 'action'>) =>
  env.observation.reduce((n, term) => n + TERM_SIZE[term.kind](term, env.action), 0);

export function policyObservation(joints: string[]): ObservationTerm[] {
  return [
    { kind: 'base-gravity' },
    { kind: 'base-angular-velocity' },
    { kind: 'base-linear-velocity' },
    { kind: 'command', size: 3 },
    { kind: 'joint-positions', joints },
    { kind: 'joint-velocities', joints },
    { kind: 'last-action' },
  ];
}

export const environmentHash = (env: Environment) => hashOf(env);

export function withServoSpreads(model: Pick<SimModel, 'servoSpreads'>, env: Environment): Environment {
  const kept = robotSpreads(model.servoSpreads, env.action.joints);

  if (!kept.length) return env;

  return { ...env, version: ENVIRONMENT_VERSION, randomization: { ...env.randomization, servos: kept } };
}

const finiteIn = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

const rangeIn = (r: unknown, min: number, max: number) =>
  Array.isArray(r) && r.length === 2 && finiteIn(r[0], min, max) && finiteIn(r[1], min, max) && r[0] <= r[1];

export interface ModelIndex {
  joints: Set<string>;
  parts: Set<string>;
  robots: Set<string>;
  bodies: Set<string>;
}

export const modelIndex = (model: SimModel, robot: string): ModelIndex => ({
  joints: new Set(model.joints.filter((j) => j.robot === robot).map((j) => j.id)),
  parts: new Set(model.bodies.flatMap((b) => b.parts)),
  robots: new Set(model.robots.map((r) => r.key)),
  bodies: new Set(model.bodies.map((b) => b.name)),
});

export const eyesOf = (env: Pick<Environment, 'observation'>): Eye[] =>
  env.observation.flatMap((t) => (t.kind === 'depth-eye' ? [t.eye] : []));

function eyeTermProblems(eye: Eye | undefined, index: ModelIndex): string[] {
  if (!eye || typeof eye !== 'object') return ['A depth eye needs its geometry.'];

  const out = eyeProblems(eye);

  if (!index.bodies.has(eye.body)) out.push(`The eye rides on ${String(eye.body)}, which this model lacks.`);

  if (!Array.isArray(eye.dirs) || eye.dirs.length !== eyeRays(eye) * 3) out.push('An eye has one direction per ray.');

  return out;
}

function jointProblems(joints: unknown, index: ModelIndex, what: string): string[] {
  if (!Array.isArray(joints) || !joints.length) return [`${what} needs at least one joint.`];

  return joints.filter((j) => !index.joints.has(j)).map((j) => `${what} names ${String(j)}, which this robot lacks.`);
}

function termProblems(term: ObservationTerm, index: ModelIndex): string[] {
  if (term.kind === 'joint-positions' || term.kind === 'joint-velocities')
    return jointProblems(term.joints, index, 'An observation');

  if (term.kind === 'command' && !finiteIn(term.size, 1, 8)) return ['A command has 1 to 8 values.'];

  if (term.kind === 'clock' && !finiteIn(term.periodS, 0.05, 60)) return ['A clock period is 0.05 to 60 s.'];

  if (term.kind === 'depth-eye') return eyeTermProblems(term.eye, index);

  return term.kind in TERM_SIZE ? [] : [`Unknown observation ${String((term as { kind: unknown }).kind)}.`];
}

function actionProblems(action: ActionSpec, index: ModelIndex): string[] {
  const out = jointProblems(action.joints, index, 'The action');

  if (action.kind !== 'position-offset' && action.kind !== 'velocity') out.push('Unknown action kind.');

  if (!finiteIn(action.scale, 1e-6, 100)) out.push('The action scale is above 0 and at most 100.');

  if (!finiteIn(action.controlDt, 1e-4, 1)) out.push('The control step runs from 0.1 ms to 1 s.');

  return out;
}

function randomizationProblems(r: Randomization): string[] {
  const out: string[] = [];

  if (!rangeIn(r.friction, 0.05, 5)) out.push('Friction scales run from 0.05 to 5.');

  if (!rangeIn(r.mass, 0.1, 10)) out.push('Mass scales run from 0.1 to 10.');

  if (!rangeIn(r.strength, 0.05, 2)) out.push('Strength scales run from 0.05 to 2.');

  if (!rangeIn(r.latencyMs, 0, MAX_LATENCY_MS)) out.push(`Latency runs from 0 to ${MAX_LATENCY_MS} ms.`);

  return out;
}

function servoProblems(env: Environment, model: SimModel): string[] {
  const spreads = env.randomization.servos;

  if (spreads === undefined) return [];

  const own = robotSpreads(model.servoSpreads, env.action.joints);
  const matches = own.length > 0 && canonicalJson(spreads) === canonicalJson(own);

  return env.version === ENVIRONMENT_VERSION && matches
    ? []
    : ['Servo spreads need environment version 2 and must match the robot’s servos.'];
}

export const MAX_START_M = 5;

const finiteList = (v: unknown, length: number) =>
  Array.isArray(v) && v.length === length && v.every((x) => typeof x === 'number' && Number.isFinite(x));

function sampleFits(sample: SkillState, joints: number): boolean {
  const lists =
    finiteList(sample.joints, joints) &&
    finiteList(sample.jointVels, joints) &&
    finiteList(sample.quat, 4) &&
    finiteList(sample.linear, 3) &&
    finiteList(sample.angular, 3);

  return lists && finiteIn(sample.height, 1e-4, 100) && Math.abs(Math.hypot(...sample.quat) - 1) < 1e-3;
}

function statesProblems(states: SkillStates | undefined, index: ModelIndex): string[] {
  if (!states) return [];

  if (typeof states.skill !== 'string' || !states.skill) return ['Start states name the skill they come from.'];

  const joints = jointProblems(states.joints, index, 'A start state');

  if (joints.length) return joints;

  const { samples } = states;

  if (!Array.isArray(samples) || samples.length < 1 || samples.length > MAX_START_STATES)
    return [`Start states hold 1 to ${MAX_START_STATES} states.`];

  return samples.every((s) => sampleFits(s, states.joints.length))
    ? []
    : [
        `Each start state has a finite position and speed for each of its ${plural(states.joints.length, 'joint')}, a height above 0 and a unit quaternion.`,
      ];
}

export function resetProblems(reset: ResetDistribution, index: ModelIndex): string[] {
  const ok = finiteIn(reset.jointNoiseDeg, 0, 90) && finiteIn(reset.baseYawDeg, 0, 180);
  const out = ok && finiteIn(reset.baseOffsetMm, 0, 10000) ? [] : ['Reset noise must be finite and not negative.'];
  const area = reset.startArea;

  if (area && !(rangeIn(area.forwardM, -MAX_START_M, MAX_START_M) && rangeIn(area.sideM, -MAX_START_M, MAX_START_M)))
    out.push(`A start area runs ${-MAX_START_M} to ${MAX_START_M} m each way, low to high.`);

  return [...out, ...statesProblems(reset.states, index)];
}

const SOURCE_KINDS = new Set([
  'time',
  'joint-position',
  'joint-velocity',
  'joint-effort',
  'part-position',
  'base-height',
  'base-tilt',
  'base-forward',
  'contact',
]);

function sourceProblems(name: string, source: SignalSource, index: ModelIndex): string[] {
  if (!SOURCE_KINDS.has(source.kind)) return [`Signal ${name} has an unknown source.`];

  if ('joint' in source && !index.joints.has(source.joint)) return [`Signal ${name} reads a missing joint.`];

  if (source.kind === 'part-position' && (!index.parts.has(source.part) || !['x', 'y', 'z'].includes(source.axis)))
    return [`Signal ${name} reads a missing part or axis.`];

  if (source.kind === 'contact' && (!index.parts.has(source.part) || !touchable(source.with, index)))
    return [`Signal ${name} checks contact with a missing part.`];

  return [];
}

const touchable = (other: string, index: ModelIndex) => other === 'floor' || index.parts.has(other);

function referenceProblems(reference: MoveReference | undefined, joints: string[]): string[] {
  if (!reference) return [];

  const { frames } = reference;
  const width = joints.length + 2;
  const same = reference.joints.length === joints.length && reference.joints.every((j, i) => j === joints[i]);

  if (!same) return ['The reference moves other joints than the action.'];

  if (!finiteIn(reference.controlDt, 1e-4, 1)) return ['The reference’s step runs from 0.1 ms to 1 s.'];

  if (!Array.isArray(frames) || frames.length < 2 || frames.length > MAX_REFERENCE_FRAMES)
    return [`A reference has 2 to ${MAX_REFERENCE_FRAMES} frames.`];

  const ok = frames.every((f) => Array.isArray(f) && f.length === width && f.every(Number.isFinite));

  return ok ? [] : [`Each reference frame has ${width} finite numbers.`];
}

async function contractProblems(env: Environment): Promise<string[]> {
  try {
    const needed = await contractSignals(env.contract);

    return needed.filter((s) => !(s in env.signals)).map((s) => `The contract reads ${s}, which no signal provides.`);
  } catch (error) {
    return [`The contract is refused: ${errorMessage(error)}`];
  }
}

function rewardProblems(reward: RewardRef): string[] {
  if (reward.kind === 'contract-robustness') return [];

  return reward.kind === 'rewardlang' && isHash(reward.hash) ? [] : ['The reward reference is unknown.'];
}

function shapeProblems(env: Environment, index: ModelIndex): string[] {
  const out: string[] = [];

  if (!ENVIRONMENT_VERSIONS.includes(env.version)) out.push('This environment version is not supported.');

  if (!index.robots.has(env.robot)) out.push('The environment names a robot this scene lacks.');

  if (!finiteIn(env.horizonS, 0.1, MAX_HORIZON_S)) out.push(`The horizon runs from 0.1 to ${MAX_HORIZON_S} s.`);

  if (!finiteIn(env.traceDt, 1e-3, env.horizonS / 2)) out.push('The trace step is at least 1 ms and half the horizon.');

  return out;
}

export async function validateEnvironment(env: Environment, model: SimModel): Promise<string[]> {
  const index = modelIndex(model, env.robot);

  return [
    ...shapeProblems(env, index),
    ...env.observation.flatMap((term) => termProblems(term, index)),
    ...actionProblems(env.action, index),
    ...randomizationProblems(env.randomization),
    ...servoProblems(env, model),
    ...resetProblems(env.reset, index),
    ...rewardProblems(env.reward),
    ...referenceProblems(env.reference, env.action.joints),
    ...Object.entries(env.signals).flatMap(([name, source]) => sourceProblems(name, source, index)),
    ...(await contractProblems(env)),
  ];
}
