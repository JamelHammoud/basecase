import type { RobotJoint } from '../types/robotics';

export function pruneEmptyJoints(joints: RobotJoint[]): RobotJoint[] {
  const references = new Map<string, number>();
  const emptyById = new Map<string, number[]>();

  for (const [index, joint] of joints.entries()) {
    if (joint.parentJoint) references.set(joint.parentJoint, (references.get(joint.parentJoint) ?? 0) + 1);

    if (joint.parent.length || joint.child.length) continue;

    const empty = emptyById.get(joint.id) ?? [];

    empty.push(index);
    emptyById.set(joint.id, empty);
  }

  const pending = [...emptyById].flatMap(([id, indices]) => (references.has(id) ? [] : indices));
  const removed = new Set<number>();

  for (let cursor = 0; cursor < pending.length; cursor++) {
    const index = pending[cursor];
    const parent = joints[index].parentJoint;

    removed.add(index);

    if (!parent) continue;

    const count = references.get(parent)! - 1;

    references.set(parent, count);

    if (count) continue;

    for (const ancestor of emptyById.get(parent) ?? []) pending.push(ancestor);
  }

  return joints.filter((_, index) => !removed.has(index));
}
