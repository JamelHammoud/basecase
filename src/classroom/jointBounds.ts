import type { RobotJoint } from '../types/robotics';
import { refuse } from '../cases/validate';

export function jointBounds(joints: RobotJoint[], parts: Set<string>) {
  const byId = new Map(joints.map((joint) => [joint.id, joint]));

  for (const joint of joints) {
    safeJoint(joint, parts);

    const seen = new Set([joint.id]);
    let parent = joint.parentJoint;

    while (parent) {
      if (seen.has(parent) || !byId.has(parent)) refuse('Robot joint', 'needs an acyclic parent chain.');

      seen.add(parent);
      parent = byId.get(parent)?.parentJoint;
    }
  }
}

function safeJoint(joint: RobotJoint, parts: Set<string>) {
  if (
    !Array.isArray(joint.parent) ||
    !Array.isArray(joint.child) ||
    ![...joint.parent, ...joint.child].every((id) => parts.has(id)) ||
    !['revolute', 'prismatic', 'fixed'].includes(joint.type)
  )
    refuse('Robot joint', 'needs supported links.');

  if ((joint.type !== 'fixed' && joint.axis.every((n) => n === 0)) || joint.origin.some((n) => Math.abs(n) > 500000))
    refuse('Robot joint', 'needs an axis and an origin within 500 m.');

  if (
    joint.effortNm !== undefined &&
    (!Number.isFinite(joint.effortNm) || joint.effortNm < 0 || joint.effortNm > 1000000)
  )
    refuse('Robot joint', 'needs a finite motor effort.');

  rangeBounds(joint.range);
}

function rangeBounds(range: RobotJoint['range']) {
  if (
    range !== undefined &&
    (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[0] > range[1])
  )
    refuse('Robot joint', 'needs an ordered finite range.');
}
