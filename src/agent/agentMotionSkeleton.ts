import type { ScenePart } from '../types/robotics';
import type { RobotSkeleton } from '../types/skeleton';
import { motionBuild } from '../motion/motionBuild';
import type { designMotionInWorker } from '../motion/motionSkeletonClient';
import { skeletonText } from './skeleton';
import { r1 } from './agentFrame';
import { angle } from '../utils/angle';

export interface MotionSkeletonPayload {
  text?: unknown;
  name?: unknown;
  height_mm?: unknown;
  tolerance_mm?: unknown;
  limbs?: unknown;
}

interface MotionSkeletonContext {
  solve: typeof designMotionInWorker;
  parts: () => ScenePart[];
  skeleton: () => RobotSkeleton | undefined;
  place: (parts: ScenePart[], skeleton: RobotSkeleton) => void;
  open: () => void;
}

function acceptedLimbs(limbs: unknown): limbs is string[] {
  return Array.isArray(limbs) && limbs.length > 0 && limbs.every((limb) => typeof limb === 'string' && !!limb.trim());
}

function requestOf(payload: MotionSkeletonPayload): Parameters<typeof designMotionInWorker>[0] | null {
  const { text, name, height_mm: heightMm, tolerance_mm: toleranceMm, limbs } = payload;

  if (typeof text !== 'string' || !text.trim()) return null;

  if (typeof heightMm !== 'number' || !Number.isFinite(heightMm) || heightMm <= 0) return null;

  if (typeof toleranceMm !== 'number' || !Number.isFinite(toleranceMm) || toleranceMm <= 0) return null;

  if (limbs !== undefined && !acceptedLimbs(limbs)) return null;

  return {
    text,
    heightMm,
    toleranceMm,
    ...(typeof name === 'string' && name ? { name } : {}),
    ...(Array.isArray(limbs) ? { limbs: limbs as string[] } : {}),
  };
}

export async function skeletonFromMotionRequest(payload: MotionSkeletonPayload, ctx: MotionSkeletonContext) {
  const request = requestOf(payload);

  if (!request) return { text: 'Give a BVH clip, positive height_mm and tolerance_mm, and optional named limbs.' };

  const result = await ctx.solve(request);

  if ('problem' in result) return { text: `${result.limb ? `${result.limb}: ` : ''}${result.problem}` };

  const now = ctx.parts();
  const built = motionBuild(result.skeleton, new Set(now.map((p) => p.id)), ctx.skeleton());

  ctx.place([...now, ...built.parts], built.skeleton);
  ctx.open();

  const report = skeletonText({ skeleton: built.skeleton, problems: [], moved: new Map(), turned: [] });
  const errors = Object.entries(result.errors).map(([limb, error]) => `${limb}: ${r1(error)} mm`);
  const dynamics = result.dynamics.map((joint) => {
    const range = built.skeleton.joints.find((j) => j.id === joint.id)?.range;
    const limits = range ? `range ${range.map((value) => angle(value)).join(' to ')}, ` : '';

    return `${joint.id}: ${limits}peak speed ${r1(joint.peakSpeedDegS)}°/s, peak acceleration ${r1(joint.peakAccelerationDegS2)}°/s²`;
  });

  return {
    text: [report, `Servo supply: ${r1(result.volts)} V`, ...errors, ...dynamics].join('\n'),
    data: { errors: result.errors, dynamics: result.dynamics, volts: result.volts },
  };
}
