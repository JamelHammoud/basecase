import type { BenchPlan } from './benchRun';
import type { CountsMount, JointStatus } from './robotState';
import { radiansFromCounts } from './robotState';
import type { JointMount } from '../reality/types';

export const TEST_CAPS = { speedRadPerS: 0.5, runSeconds: 30 } as const;

const WIGGLE_RAD = 0.12;

const ramp = (seconds: number, from: number, to: number) => Math.min(1, Math.max(0, (seconds - from) / (to - from)));

export const WIGGLE_PLAN: BenchPlan = {
  seconds: 3,
  offset: (seconds) => WIGGLE_RAD * (ramp(seconds, 0.5, 1) - ramp(seconds, 2, 2.5)),
};

export const REFERENCE_PLAN: BenchPlan = {
  seconds: 6,
  offset: (seconds) => 0.15 * Math.sin((2 * Math.PI * seconds) / 6),
};

const SPEED_SAMPLE_S = 0.02;
const COUNTS_PER_RAD = 4096 / (2 * Math.PI);
const MOVED_COUNTS = 12;

export const OFFSET_TOLERANCE_RAD = 0.04;
export const REPLAY_TOLERANCE_RAD = 0.1;

export function peakSpeed(plan: BenchPlan): number {
  let peak = 0;

  for (let at = 0; at < plan.seconds; at += SPEED_SAMPLE_S)
    peak = Math.max(peak, Math.abs(plan.offset(at + SPEED_SAMPLE_S) - plan.offset(at)) / SPEED_SAMPLE_S);

  return peak;
}

export const withinTestCaps = (plan: BenchPlan) =>
  plan.seconds <= TEST_CAPS.runSeconds && peakSpeed(plan) <= TEST_CAPS.speedRadPerS;

export interface Probe {
  counts: number;
  link: number;
  drives: number;
}

export function probeOf(status: JointStatus | undefined): Probe | null {
  if (!status || typeof status.position !== 'number' || typeof status.link_rad !== 'number' || status.id === null)
    return null;

  return { counts: status.position, link: status.link_rad, drives: status.drives ?? status.id };
}

export interface MotorProbe {
  id: number;
  jointId: string;
  movedJointId: string;
  belief: CountsMount;
  rest: Probe;
  peak: Probe;
}

export type PowerOnFinding =
  | { kind: 'swapped'; id: number; jointId: string; movedJointId: string; mount: JointMount }
  | { kind: 'reversed'; id: number; jointId: string; movedJointId: string; mount: JointMount }
  | { kind: 'offset'; id: number; jointId: string; movedJointId: string; mount: JointMount; gapRad: number }
  | { kind: 'missing'; id: number; jointId: string }
  | { kind: 'stuck'; id: number; jointId: string }
  | { kind: 'duplicate'; id: number; jointId: string };

export type PowerOnFault = Extract<PowerOnFinding, { mount: JointMount }>;

export const isFixable = (finding: PowerOnFinding): finding is PowerOnFault => 'mount' in finding;

export function truthMount({ rest, peak }: Pick<MotorProbe, 'rest' | 'peak'>): JointMount | null {
  const turned = peak.counts - rest.counts;

  if (Math.abs(turned) < MOVED_COUNTS) return null;

  const direction = Math.sign(peak.link - rest.link) === Math.sign(turned) ? 1 : -1;

  return { zeroCounts: Math.round(rest.counts - direction * rest.link * COUNTS_PER_RAD), direction };
}

export function analyseMotor(probe: MotorProbe): PowerOnFinding | null {
  const { id, jointId, movedJointId, belief, rest } = probe;
  const mount = truthMount(probe);

  if (!mount) return { kind: 'stuck', id, jointId };

  const named = { id, jointId, movedJointId, mount };

  if (movedJointId !== jointId) return { kind: 'swapped', ...named };

  if (mount.direction !== belief.direction) return { kind: 'reversed', ...named };

  const gapRad = Math.abs(radiansFromCounts(rest.counts, belief) - rest.link);

  return gapRad > OFFSET_TOLERANCE_RAD ? { kind: 'offset', ...named, gapRad } : null;
}

export interface ReplaySample {
  seconds: number;
  link: Array<number | null>;
}

export interface ReplayGap {
  index: number;
  gapRad: number;
}

export function replayGaps(samples: readonly ReplaySample[], plan: BenchPlan, count: number): ReplayGap[] {
  const first = samples[0];

  return Array.from({ length: count }, (_, index) => {
    const start = first?.link[index];
    let gapRad = 0;

    for (const sample of samples) {
      const link = sample.link[index];

      if (typeof link !== 'number' || typeof start !== 'number') return { index, gapRad: Number.POSITIVE_INFINITY };

      gapRad = Math.max(gapRad, Math.abs(link - start - plan.offset(sample.seconds)));
    }

    return { index, gapRad };
  });
}

export const widest = (gaps: readonly ReplayGap[]): ReplayGap | null =>
  gaps.reduce<ReplayGap | null>((best, gap) => (!best || gap.gapRad > best.gapRad ? gap : best), null);
