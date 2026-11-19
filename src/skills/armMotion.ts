import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { JointValues, RobotPoseState } from '../types/robotics';
import type { SkillController } from './artifacts';
import { ArmConfiguration } from './armConfiguration';
import type { ArmCoordinate } from './armConfiguration';
import { configurationDelta, searchConfigurations, type ConfigurationResult } from './configurationSearch';

export interface ArmMotionInput {
  parts: string[];
  keys: { t: number; values: JointValues }[];
  horizonS: number;
  start?: RobotPoseState;
  seed?: number;
  stop: () => boolean;
}

export interface ArmMotionResult {
  controller: SkillController | null;
  reason: string;
  checks: number;
  nodes: number;
}

const REFUSALS: Record<Exclude<ConfigurationResult['status'], 'found'>, string> = {
  budget: 'No motion was found within the search budget.',
  start: 'The starting pose has too little clearance.',
  goal: 'The target pose has too little clearance.',
  limits: 'The motion exceeds a joint limit.',
  cancelled: 'Stopped.',
};

const TIME_REFUSAL = 'The motion needs more time.';
const CORNER_HOLD_S = 0.2;

function goalCoordinate(joint: ArmCoordinate, value: number | undefined, previous: number): number {
  const q = value === undefined ? previous : (value * Math.PI) / 180;
  const [lo, hi] = joint.range;

  if (!joint.continuous && q >= lo - 1e-12 && q <= hi + 1e-12) return Math.min(hi, Math.max(lo, q));

  return q;
}

function timed(input: ArmMotionInput): boolean {
  return (
    Number.isFinite(input.horizonS) &&
    input.horizonS > 0 &&
    input.keys.length > 0 &&
    input.keys.length <= 32 &&
    input.keys.every(
      (key, i) =>
        Number.isFinite(key.t) && key.t >= 0 && key.t <= input.horizonS && (!i || key.t >= input.keys[i - 1].t),
    )
  );
}

function pathKeys(space: ArmConfiguration, path: number[][], span: { from: number; to: number }) {
  const lengths = path.map((q, i) =>
    i === 0 ? 0 : Math.max(...configurationDelta(path[i - 1], q, space.joints).map(Math.abs)),
  );
  const duration = lengths.reduce((sum, n) => sum + n, 0);
  const holds = Math.max(0, path.length - 2) * CORNER_HOLD_S;
  const movingS = span.to - span.from - holds;

  if (duration > movingS) return null;

  if (path.length === 1) return [{ t: span.to, values: space.values(path[0]) }];

  let elapsed = span.from;

  return path.slice(1).flatMap((q, i) => {
    elapsed += duration > 0 ? (lengths[i + 1] / duration) * movingS : movingS;

    const arrival = { t: elapsed, values: space.values(q) };

    if (i === path.length - 2) return [arrival];

    elapsed += CORNER_HOLD_S;

    return [arrival, { t: elapsed, values: arrival.values }];
  });
}

export async function planArmMotion(mj: MainModule, model: SimModel, input: ArmMotionInput): Promise<ArmMotionResult> {
  const space = new ArmConfiguration(mj, { ...model, initial: input.start ?? model.initial }, input.parts, {
    marginM: 0.025,
    clearanceM: 0.004,
  });
  let checks = 0;
  let nodes = 0;
  const refused = (reason: string): ArmMotionResult => ({ controller: null, reason, checks, nodes });

  try {
    if (!timed(input)) return refused(TIME_REFUSAL);

    let previous = space.start;
    let time = 0;
    const keyframes = [{ t: 0, values: space.values(previous) }];

    for (const key of input.keys) {
      const unrelated = Object.keys(key.values).some(
        (id) =>
          !space.joints.some((j) => j.id === id) &&
          (space.fixedValues[id] === undefined || Math.abs(key.values[id] - space.fixedValues[id]) > 1e-8),
      );

      if (unrelated) return refused('The motion changes a joint outside the target chain.');

      const goal = space.joints.map((j, i) => goalCoordinate(j, key.values[j.id], previous[i]));
      const plan = await searchConfigurations({
        start: previous,
        goal,
        joints: space.joints,
        clear: space.clear,
        separation: () => space.separationM,
        reserveM: 0.002,
        seed: input.seed ?? 1812,
        stop: input.stop,
        budget: 65_536 - checks,
        maximumCost: key.t - time,
        cornerCost: CORNER_HOLD_S,
      });

      checks += plan.checks;
      nodes += plan.nodes;

      if (plan.status !== 'found') return refused(REFUSALS[plan.status]);

      const keys = pathKeys(space, plan.path, { from: time, to: key.t });

      if (!keys) return refused(TIME_REFUSAL);

      if (key.t > time) keyframes.push(...keys);

      previous = plan.path.at(-1)!;
      time = key.t;
    }

    if (input.stop()) return refused(REFUSALS.cancelled);

    return {
      controller: {
        kind: 'animation',
        animation: {
          id: 'reach-plan',
          name: 'Reach plan',
          duration: input.horizonS,
          loop: false,
          interpolation: 'linear',
          keyframes,
        },
      },
      reason: '',
      checks,
      nodes,
    };
  } finally {
    space.dispose();
  }
}
