import type { JointValues } from '../types/robotics';
import type { RobotSkeleton, SkeletonJoint } from '../types/skeleton';
import type { Mocap } from './mocapBones';
import { fitMotionChain } from './motionSkeletonSearch';
import { motionChains, motionLeaves, motionScale } from './motionSkeletonSource';
import { sampleMotionFrames } from './motionSkeletonValidation';
import { shareMotionJoints } from './motionSkeletonShared';
import { motionWithEndSites } from './motionSkeletonEnds';
import { motionJointDynamics, motionJointSpan } from './motionSkeletonStats';

export interface MotionSkeletonRequest {
  motion: Mocap;
  heightMm: number;
  toleranceMm: number;
  limbs?: string[];
}

export interface MotionJointDynamics {
  id: string;
  peakSpeedDegS: number;
  peakAccelerationDegS2: number;
}

export interface MotionSkeletonFit {
  skeleton: RobotSkeleton;
  trajectory: Array<{ t: number; values: JointValues }>;
  dynamics: MotionJointDynamics[];
  errors: Record<string, number>;
}

export type MotionSkeletonResult = MotionSkeletonFit | { problem: string; limb?: string };

function requestProblem(request: MotionSkeletonRequest): string | undefined {
  const { motion, heightMm, toleranceMm } = request;

  if (!Number.isFinite(heightMm) || heightMm <= 0) return 'Height must be greater than zero.';

  if (!Number.isFinite(toleranceMm) || toleranceMm <= 0) return 'Path tolerance must be greater than zero.';

  if (
    !Number.isInteger(motion.frames) ||
    motion.frames < 2 ||
    !Number.isFinite(motion.frameTime) ||
    motion.frameTime <= 0
  )
    return 'The motion needs at least two timed frames.';

  if (!motion.rotations) return 'The motion needs ordered rotation channels.';

  if (!Number.isFinite(motionScale(motion, heightMm))) return 'The motion needs a measurable height.';

  return undefined;
}

export function motionSkeleton(request: MotionSkeletonRequest): MotionSkeletonResult {
  const input = { ...request, motion: motionWithEndSites(request.motion) };
  const problem = requestProblem(input);

  if (problem) return { problem };

  const { motion, toleranceMm } = input;
  const samples = sampleMotionFrames(motion);

  if ('problem' in samples) return samples;

  const leaves = motionLeaves(motion, request.limbs);

  if (!leaves.length) return { problem: 'No motion chains match the selected limbs.' };

  const chains = motionChains(motion, samples, { scale: motionScale(motion, request.heightMm), limbs: request.limbs });
  const trajectory = Array.from({ length: motion.frames }, (_, frame) => ({
    t: frame * motion.frameTime,
    values: {} as JointValues,
  }));
  const joints: SkeletonJoint[] = [];
  const errors: Record<string, number> = {};

  for (const chain of chains) {
    const fit = fitMotionChain(chain, toleranceMm);

    if (!fit) return { problem: `The ${chain.name} path can’t fit within ${toleranceMm} mm.`, limb: chain.name };

    joints.push(...fit.joints.map((joint) => motionJointSpan(joint, fit.values)));
    fit.values.forEach((values, frame) => Object.assign(trajectory[frame].values, values));
    errors[chain.name] = fit.error;
  }

  if (!joints.length) return { problem: 'The motion has no moving joints.', limb: leaves[0] };

  const shared = shareMotionJoints(joints, trajectory);

  return {
    skeleton: { frame: 'z-up', joints: shared, pairs: [] },
    trajectory,
    dynamics: shared.map((joint) => motionJointDynamics(joint.id, trajectory, motion.frameTime)),
    errors,
  };
}
