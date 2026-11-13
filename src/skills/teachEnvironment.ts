import type { Eye } from '../sim/eyes';
import type { SimModel } from '../sim/mjcfTypes';
import type { Contract } from './contract';
import { policyObservation, type Environment, type SignalSource, type StartArea } from './environment';
import { sha256Hex } from './hash';
import { KIT_ACTION_SCALE, kitRobot, type V3 } from './kitModel';
import type { RaceGoal } from './raceTypes';
import type { TaskAnalysis } from './router';

export type DraftGoal =
  | { kind: 'reach'; part: string; waypoints: Array<{ point_mm: V3; hold_s?: number }> }
  | { kind: 'velocity'; command: V3 }
  | { kind: 'open' };

export interface DraftInput {
  name: string;
  request: string;
  goal: DraftGoal;
  seconds: number;
  contract: Contract;
  signals?: Record<string, SignalSource>;
  rewards?: string[];
  eye?: Eye;
  startArea?: StartArea;
  analysis?: { quasiStatic?: boolean; motionShapeMatters?: boolean; contactRich?: boolean };
}

const ARM_ACTION_SCALE = 0.25;
const CONTROL_DT = 0.02;
const TRACE_DT = 0.02;
const MIN_SECONDS = 0.5;
const MAX_SECONDS = 60;
const MAX_NAME = 60;
const MAX_REWARDS = 6;
const MAX_REWARD_CHARS = 8000;

const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isV3 = (v: unknown): v is V3 => Array.isArray(v) && v.length === 3 && v.every(finite);

function goalProblem(goal: DraftGoal | undefined, model: SimModel): string | null {
  if (!goal || !['reach', 'velocity', 'open'].includes(goal.kind)) return 'The goal is reach, velocity or open.';

  if (goal.kind === 'velocity') return isV3(goal.command) ? null : 'A velocity goal needs [forward, left, turn].';

  if (goal.kind === 'open') return null;

  if (!model.bodies.some((b) => b.parts.includes(goal.part))) return `The robot has no part ${goal.part}.`;

  const ok = Array.isArray(goal.waypoints) && goal.waypoints.length > 0 && goal.waypoints.length <= 8;

  return ok && goal.waypoints.every((w) => isV3(w.point_mm))
    ? null
    : 'A reach goal needs 1 to 8 waypoints, each a point_mm.';
}

export function draftProblems(input: DraftInput, model: SimModel): string[] {
  const out: string[] = [];

  if (!model.robots.length) out.push('The scene has no robot with joints.');

  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > MAX_NAME)
    out.push(`The name is 1 to ${MAX_NAME} characters.`);

  if (!finite(input.seconds) || input.seconds < MIN_SECONDS || input.seconds > MAX_SECONDS)
    out.push(`A try lasts ${MIN_SECONDS} to ${MAX_SECONDS} s.`);

  const rewards = input.rewards ?? [];

  if (rewards.length > MAX_REWARDS || rewards.some((r) => typeof r !== 'string' || r.length > MAX_REWARD_CHARS))
    out.push(`Up to ${MAX_REWARDS} rewards, each under ${MAX_REWARD_CHARS} characters.`);

  const goal = goalProblem(input.goal, model);

  return goal ? [...out, goal] : out;
}

function defaultSignals(floating: boolean, joints: string[]): Record<string, SignalSource> {
  const base: Record<string, SignalSource> = floating
    ? { height: { kind: 'base-height' }, tilt: { kind: 'base-tilt' }, forward: { kind: 'base-forward' } }
    : {};
  const positions = joints.map((id): [string, SignalSource] => [`q_${id}`, { kind: 'joint-position', joint: id }]);

  return { time: { kind: 'time' }, ...base, ...Object.fromEntries(positions) };
}

export function draftEnvironment(model: SimModel, input: DraftInput): Environment {
  const robot = kitRobot(model);
  const reward = input.rewards?.[0];

  return {
    version: 1,
    robot: robot.key,
    horizonS: input.seconds,
    traceDt: TRACE_DT,
    observation: [
      ...policyObservation(robot.joints),
      ...(input.eye ? [{ kind: 'depth-eye' as const, eye: input.eye }] : []),
    ],
    action: {
      kind: 'position-offset',
      joints: robot.joints,
      scale: robot.floating ? KIT_ACTION_SCALE : ARM_ACTION_SCALE,
      controlDt: CONTROL_DT,
    },
    reset: {
      jointNoiseDeg: 1,
      baseYawDeg: 0,
      baseOffsetMm: 0,
      ...(input.startArea ? { startArea: input.startArea } : {}),
    },
    randomization: { friction: [0.8, 1.2], mass: [0.9, 1.1], strength: [0.9, 1], latencyMs: [0, 20] },
    reward: reward ? { kind: 'rewardlang', hash: sha256Hex(reward) } : { kind: 'contract-robustness' },
    contract: input.contract,
    signals: { ...defaultSignals(robot.floating, robot.joints), ...(input.signals ?? {}) },
  };
}

export function draftGoal(goal: DraftGoal): RaceGoal {
  if (goal.kind !== 'reach') return goal.kind === 'velocity' ? { kind: 'velocity', command: goal.command } : goal;

  return {
    kind: 'reach',
    part: goal.part,
    waypoints: goal.waypoints.map((w) => ({
      point: w.point_mm.map((v) => v / 1000) as V3,
      holdS: Math.max(0, w.hold_s ?? 0.5),
    })),
  };
}

export function draftAnalysis(model: SimModel, input: DraftInput): TaskAnalysis {
  const robot = kitRobot(model);
  const hints = input.analysis ?? {};

  return {
    simCanCheck: true,
    quasiStatic: hints.quasiStatic ?? input.goal.kind === 'reach',
    motionShapeMatters: hints.motionShapeMatters ?? false,
    kitSkills: null,
    stateDimension: 2 * robot.joints.length + (robot.floating ? 12 : 0),
    contactRich: hints.contactRich ?? robot.floating,
    trajectoryOptimisation: 'not-tried',
    rewardSearchRounds: 0,
    demo: 'not-asked',
  };
}
