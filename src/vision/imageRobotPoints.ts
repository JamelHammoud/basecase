import { footPoints } from '../sim/driveLegs';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { buildRig, resolveJoints, type V3 } from '../utils/kinematics';

export interface ImageRobotPointInput {
  parts: ScenePart[];
  joints?: RobotJoint[];
}

export function imageRobotPoints(input: ImageRobotPointInput): Map<string, Record<string, V3>> {
  const joints = resolveJoints(input.joints ?? [], input.parts);
  const feet = new Map(footPoints(buildRig(joints, input.parts), input.parts).map((foot) => [foot.part, foot.point]));

  return new Map(
    input.parts.map((part) => {
      const frames = Object.fromEntries(
        joints.filter((joint) => joint.child.includes(part.id)).map((joint) => [joint.name, joint.origin]),
      );
      const tip = feet.get(part.id);

      return [part.id, { ...frames, ...(tip ? { tip } : {}) }];
    }),
  );
}
