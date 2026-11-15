import type { JointValues } from '../types/robotics';
import type { RobotSkeleton, SkeletonJoint } from '../types/skeleton';
import type { Mocap } from './mocapBones';
import { fitMotionChain } from './motionSkeletonSearch';
import { motionChains, motionLeaves, motionScale } from './motionSkeletonSource';
import { motionDataProblem } from './motionSkeletonValidation';
import { shareMotionJoints } from './motionSkeletonShared';
import { motionWithEndSites } from './motionSkeletonEnds';

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

function jointSpan(joint: SkeletonJoint, values: JointValues[]): SkeletonJoint {
  const angles = values.map((frame) => frame[joint.id] ?? 0);
  const low = Math.min(...angles);
  const high = Math.max(...angles);
  const margin = (high - low) * 0.1;

  return { ...joint, range: [low - margin, high + margin] };
}

function dynamicsFor(joint: SkeletonJoint, values: JointValues[], frameTime: number): MotionJointDynamics {
  const angles = values.map((frame) => frame[joint.id] ?? 0);
  const speeds = angles.slice(1).map((angle, index) => (angle - angles[index]) / frameTime);
  const accelerations = speeds.slice(1).map((speed, index) => (speed - speeds[index]) / frameTime);

  return {
    id: joint.id,
    peakSpeedDegS: Math.max(0, ...speeds.map(Math.abs)),
    peakAccelerationDegS2: Math.max(0, ...accelerations.map(Math.abs)),
  };
}

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
  const dataProblem = motionDataProblem(motion);

  if (dataProblem) return dataProblem;

  const leaves = motionLeaves(motion, request.limbs);

  if (!leaves.length) return { problem: 'No motion chains match the selected limbs.' };

  const chains = motionChains(motion, { scale: motionScale(motion, request.heightMm), limbs: request.limbs });
  const trajectory = Array.from({ length: motion.frames }, (_, frame) => ({
    t: frame * motion.frameTime,
    values: {} as JointValues,
  }));
  const joints: SkeletonJoint[] = [];
  const errors: Record<string, number> = {};

  for (const chain of chains) {
    const fit = fitMotionChain(chain, toleranceMm);

    if (!fit) return { problem: `The ${chain.name} path can’t fit within ${toleranceMm} mm.`, limb: chain.name };

    joints.push(...fit.joints.map((joint) => jointSpan(joint, fit.values)));
    fit.values.forEach((values, frame) => Object.assign(trajectory[frame].values, values));
    errors[chain.name] = fit.error;
  }

  if (!joints.length) return { problem: 'The motion has no moving joints.', limb: leaves[0] };

  const shared = shareMotionJoints(joints, trajectory);

  return {
    skeleton: { frame: 'z-up', joints: shared, pairs: [] },
    trajectory,
    dynamics: shared.map((joint) =>
      dynamicsFor(
        joint,
        trajectory.map((frame) => frame.values),
        motion.frameTime,
      ),
    ),
    errors,
  };
}
