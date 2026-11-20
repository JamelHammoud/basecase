import type { RobotJoint, ScenePart } from '../types/robotics';
import type { V3 } from './kinematics';
import { remappedTendon } from '../joints/tendonReferences';

export const jointPartIds = (joint: RobotJoint): string[] => [
  ...joint.parent,
  ...joint.child,
  ...(joint.actuators ?? []),
  ...(joint.frame ? [joint.frame.part] : []),
];

function mappedId(names: Map<string, string>, id: string): string {
  const mapped = names.get(id);

  if (!mapped) throw new Error('Save the complete assembly to Library again.');

  return mapped;
}

export function capturedJoints(joints: readonly RobotJoint[], parts: ScenePart[], center: number[]): RobotJoint[] {
  const selected = new Set(parts.map((part) => part.id));
  const included = joints.filter((joint) => jointPartIds(joint).every((id) => selected.has(id)));
  const jointIds = new Set(included.map((joint) => joint.id));

  for (const joint of joints) {
    const terms = joint.tendon?.terms ?? [];
    const touched = jointIds.has(joint.id) || terms.some((term) => jointIds.has(term.joint));

    if (terms.length && touched && (!jointIds.has(joint.id) || terms.some((term) => !jointIds.has(term.joint))))
      throw new Error('Save the complete assembly to Library again.');
  }

  return included.map((source) => {
    const joint = structuredClone(source);
    const node = (id: string) => `node-${id}`;

    return {
      ...joint,
      parent: joint.parent.map(node),
      child: joint.child.map(node),
      ...(joint.actuators ? { actuators: joint.actuators.map(node) } : {}),
      parentJoint: joint.parentJoint && jointIds.has(joint.parentJoint) ? joint.parentJoint : undefined,
      origin: joint.origin.map((value, i) => value - center[i]) as V3,
      frame:
        joint.frame && selected.has(joint.frame.part) ? { ...joint.frame, part: node(joint.frame.part) } : undefined,
    };
  });
}

export function placedJoints(
  joints: readonly RobotJoint[],
  parts: Map<string, string>,
  base: V3,
  makeId: (prefix?: string) => string,
): RobotJoint[] {
  const names = new Map(joints.map((joint) => [joint.id, makeId('joint')]));
  const partId = (id: string) => mappedId(parts, id);

  if (names.size !== joints.length) throw new Error('Save the complete assembly to Library again.');

  return joints.map((source) => {
    const joint = structuredClone(source);

    return {
      ...joint,
      id: names.get(joint.id)!,
      parent: joint.parent.map(partId),
      child: joint.child.map(partId),
      parentJoint: joint.parentJoint ? mappedId(names, joint.parentJoint) : undefined,
      ...(joint.actuators ? { actuators: joint.actuators.map(partId) } : {}),
      ...(joint.loop ? { loop: { ...joint.loop, driver: mappedId(names, joint.loop.driver) } } : {}),
      ...remappedTendon(joint.tendon, (id) => mappedId(names, id)),
      origin: joint.origin.map((value, i) => value + base[i]) as V3,
      frame: joint.frame ? { ...joint.frame, part: partId(joint.frame.part) } : undefined,
    };
  });
}
