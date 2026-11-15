import { Vector3 } from 'three';
import type { Mocap, MocapRotation } from './mocapBones';

export interface MotionFrames {
  positions: Map<string, Vector3>[];
  rotations: Map<string, MocapRotation[]>[];
}

interface MotionProblem {
  problem: string;
  limb: string;
}

function frameProblem(options: {
  motion: Mocap;
  points: Map<string, Vector3>;
  rotations: Map<string, MocapRotation[]>;
  lengths: Map<string, number>;
}): MotionProblem | undefined {
  const { motion, points, rotations, lengths } = options;

  for (const bone of motion.bones) {
    const point = points.get(bone);
    const channels = rotations.get(bone) ?? [];

    if (
      !point ||
      !point.toArray().every(Number.isFinite) ||
      channels.some((channel) => !Number.isFinite(channel.degrees))
    )
      return { problem: `The ${bone} motion has a missing or non-finite frame.`, limb: bone };

    const parent = motion.parentOf.get(bone);
    const parentPoint = parent ? points.get(parent) : undefined;

    if (!parentPoint) continue;

    const length = point.distanceTo(parentPoint);
    const first = lengths.get(bone) ?? length;

    lengths.set(bone, first);

    if (Math.abs(length - first) > Math.max(0.0001, first * 0.00001))
      return { problem: `The ${bone} motion changes a link length and can’t use revolute joints.`, limb: bone };
  }

  return undefined;
}

export function sampleMotionFrames(motion: Mocap): MotionFrames | MotionProblem {
  const lengths = new Map<string, number>();
  const result: MotionFrames = { positions: [], rotations: [] };

  for (let frame = 0; frame < motion.frames; frame++) {
    const time = frame * motion.frameTime;
    const points = motion.sample(time);
    const rotations = motion.rotations!(time);
    const problem = frameProblem({ motion, points, rotations, lengths });

    if (problem) return problem;

    const root = points.get(motion.root) ?? new Vector3(Number.NaN, Number.NaN, Number.NaN);

    result.positions.push(new Map([...points].map(([name, point]) => [name, point.clone().sub(root)])));
    result.rotations.push(rotations);
  }

  return result;
}
