import type { GuideStep } from '../guide/guideTypes';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { isMovable } from '../utils/kinematics';

export function rigidCradleSelection(ids: string[], joints: RobotJoint[]): boolean {
  if (!ids.length || new Set(ids).size !== ids.length) return false;

  if (ids.length === 1) return true;

  const declared = joints.some((joint) =>
    [joint.parent, joint.child].some((body) => ids.every((id) => body.includes(id))),
  );
  const crosses = joints.some(
    (joint) =>
      isMovable(joint) && joint.parent.some((id) => ids.includes(id)) && joint.child.some((id) => ids.includes(id)),
  );

  return declared && !crosses;
}

export function cradleSelections(parts: ScenePart[], joints: RobotJoint[], step: GuideStep) {
  const shown = new Set([...step.partIds, ...step.contextIds]);
  const usable = parts.filter(
    (part) => shown.has(part.id) && part.role === 'solid' && part.visible && part.kind !== 'image_plane',
  );
  const single = usable.map((part) => ({ id: part.id, name: part.name, ids: [part.id] }));
  const bodies = joints.flatMap((joint) =>
    [joint.parent, joint.child].flatMap((ids, index) => {
      const selected = ids.filter((id) => usable.some((part) => part.id === id));

      return selected.length > 1 && rigidCradleSelection(selected, joints)
        ? [{ id: `${joint.id}:${index}`, name: joint.name, ids: selected }]
        : [];
    }),
  );

  return [...bodies, ...single];
}
