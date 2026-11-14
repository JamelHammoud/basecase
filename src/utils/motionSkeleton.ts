import type { SkeletonJointInput, SkeletonPayload } from '../agent/skeleton';
import type { JointValues } from '../types/robotics';
import type { ZUpVec } from '../types/skeleton';
import { candidateAxes, chainOrder } from './motionAxes';
import { motionChains, type MotionChain } from './motionChains';
import type { MotionClip } from './motionClip';
import { chainJoints, replayChain, type ChainJoint, type Replay } from './motionReplay';
import { lengthLabel } from './size';

export interface MotionRequest {
  heightMm: number;
  toleranceMm?: number;
  limbs?: string[];
}

export interface JointMotion {
  peakDegS: number;
  peakDegS2: number;
}

export interface LimbFit {
  id: string;
  joints: string[];
  effectorMm: number;
}

export interface MotionFit {
  skeleton: SkeletonPayload;
  limbs: LimbFit[];
  motion: Record<string, JointMotion>;
  toleranceMm: number;
}

export type MotionFitResult = { fit: MotionFit } | { problem: string; limb?: string };

export const MIN_HEIGHT_MM = 50;
export const MAX_HEIGHT_MM = 3000;

const RANGE_MARGIN = 0.1;

export const defaultTolerance = (heightMm: number) => Math.max(1, Math.round(heightMm / 100));

const r1 = (v: number) => Math.round(v * 10) / 10 + 0;

const limbLabel = (id: string) => id.replace(/_/g, ' ');

interface ChainFit {
  chain: MotionChain;
  joints: ChainJoint[];
  replay: Replay;
}

function fitChain(chain: MotionChain, toleranceMm: number, taken: Set<string>): ChainFit | null {
  const axes = candidateAxes(chain);

  for (let k = 0; k <= axes.length; k++) {
    const ids = new Set(taken);
    const joints = chainJoints(chain, chainOrder(chain, axes.slice(0, k)), ids);
    const replay = replayChain(chain, joints, toleranceMm);

    if (replay) {
      for (const j of joints) taken.add(j.id);

      return { chain, joints, replay };
    }
  }

  return null;
}

function series(values: JointValues[], id: string): number[] {
  return values.map((v) => v[id] ?? 0);
}

function rangeOf(angles: number[]): [number, number] {
  const lo = Math.min(...angles);
  const hi = Math.max(...angles);
  const margin = (hi - lo) * RANGE_MARGIN;

  return [r1(lo - margin), r1(hi + margin)];
}

function peaks(angles: number[], dt: number): JointMotion {
  let speed = 0;
  let accel = 0;

  for (let k = 1; k < angles.length - 1; k++) {
    speed = Math.max(speed, Math.abs(angles[k + 1] - angles[k - 1]) / (2 * dt));
    accel = Math.max(accel, Math.abs(angles[k + 1] - 2 * angles[k] + angles[k - 1]) / (dt * dt));
  }

  return { peakDegS: Math.round(speed), peakDegS2: Math.round(accel) };
}

function jointInput(fit: ChainFit, j: ChainJoint, last: boolean): SkeletonJointInput {
  const angles = series(fit.replay.values, j.id);
  const tip: ZUpVec | undefined = last ? fit.chain.rest[fit.chain.rest.length - 1] : undefined;

  return {
    id: j.id,
    ...(j.parent ? { parent: j.parent } : {}),
    origin: j.origin,
    axis: j.axis,
    range: rangeOf(angles),
    limb: j.limb,
    ...(tip ? { tip } : {}),
  };
}

function selectChains(chains: MotionChain[], limbs?: string[]): MotionChain[] | string {
  if (!limbs?.length) return chains;

  const missing = limbs.find((l) => !chains.some((c) => c.id === l));

  if (missing) return `No limb ${missing}. Limbs: ${chains.map((c) => c.id).join(', ')}.`;

  return chains.filter((c) => limbs.includes(c.id));
}

function requestProblem(req: MotionRequest, toleranceMm: number): string | null {
  if (!(req.heightMm >= MIN_HEIGHT_MM && req.heightMm <= MAX_HEIGHT_MM))
    return `Give a height from ${MIN_HEIGHT_MM} to ${MAX_HEIGHT_MM} mm.`;

  return toleranceMm > 0 ? null : 'Give a tolerance above 0 mm.';
}

export function fitMotionSkeleton(clip: MotionClip, req: MotionRequest): MotionFitResult {
  const toleranceMm = req.toleranceMm ?? defaultTolerance(req.heightMm);
  const bad = requestProblem(req, toleranceMm);

  if (bad) return { problem: bad };

  const chains = selectChains(motionChains(clip, req.heightMm), req.limbs);

  if (typeof chains === 'string') return { problem: chains };

  if (!chains.length) return { problem: 'The clip has no limbs to fit.' };

  const taken = new Set<string>();
  const fits: ChainFit[] = [];

  for (const chain of chains) {
    const fit = fitChain(chain, toleranceMm, taken);

    if (!fit)
      return {
        problem: `No skeleton keeps the ${limbLabel(chain.id)} within ${lengthLabel(toleranceMm)} of its path.`,
        limb: chain.id,
      };

    fits.push(fit);
  }

  const moving = fits.filter((f) => f.joints.length);

  if (!moving.length) return { problem: `Nothing in ${clip.name} moves more than ${lengthLabel(toleranceMm)}.` };

  const joints = moving.flatMap((f) => f.joints.map((j, i) => jointInput(f, j, i === f.joints.length - 1)));
  const motion = Object.fromEntries(
    moving.flatMap((f) => f.joints.map((j) => [j.id, peaks(series(f.replay.values, j.id), clip.frameTime)])),
  );

  return {
    fit: {
      skeleton: { joints, replace: true },
      limbs: fits.map((f) => ({ id: f.chain.id, joints: f.joints.map((j) => j.id), effectorMm: f.replay.effectorMm })),
      motion,
      toleranceMm,
    },
  };
}
