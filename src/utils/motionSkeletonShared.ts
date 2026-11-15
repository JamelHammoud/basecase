import type { JointValues } from '../types/robotics';
import type { SkeletonJoint } from '../types/skeleton';

const sameTip = (a: SkeletonJoint, b: SkeletonJoint) =>
  !a.tip || !b.tip || a.tip.every((value, index) => value === b.tip![index]);

export function shareMotionJoints(joints: SkeletonJoint[], frames: Array<{ values: JointValues }>): SkeletonJoint[] {
  const canonical = new Map<string, string>();
  const groups = new Map<string, SkeletonJoint[]>();
  const result: SkeletonJoint[] = [];

  for (const original of joints) {
    const parent = original.parent ? canonical.get(original.parent) : undefined;
    const joint = { ...original, ...(parent ? { parent } : {}) };
    const key = JSON.stringify([joint.name, joint.parent, joint.origin, joint.axis]);
    const matches = groups.get(key) ?? [];
    const shared = matches.find(
      (candidate) =>
        sameTip(candidate, joint) && frames.every((frame) => frame.values[candidate.id] === frame.values[joint.id]),
    );

    if (shared) {
      canonical.set(joint.id, shared.id);

      shared.tip ??= joint.tip;

      frames.forEach((frame) => delete frame.values[joint.id]);

      continue;
    }

    canonical.set(joint.id, joint.id);
    matches.push(joint);
    groups.set(key, matches);
    result.push(joint);
  }

  return result;
}
