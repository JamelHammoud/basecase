import type { RobotJoint } from '../types/robotics';

interface JointIdsInput {
  joints: RobotJoint[];
  fresh: RobotJoint[];
  mine: RobotJoint[];
  sceneIdOf: Map<string, string>;
}

type MateIndex = Map<string | undefined, Set<RobotJoint>>;

function remainingByMate(mine: RobotJoint[]): MateIndex {
  const index: MateIndex = new Map();

  for (const joint of mine) {
    const mate = joint.onshape!.mate;
    const group = index.get(mate);

    if (group) group.add(joint);
    else index.set(mate, new Set([joint]));
  }

  return index;
}

function freeJointId(base: string, taken: Set<string>): string {
  let n = 1;
  const idOf = () => (n === 1 ? base : `${base}_${n}`);

  while (taken.has(idOf())) n++;

  taken.add(idOf());

  return idOf();
}

function matchingJoint(fresh: RobotJoint, remaining: MateIndex, sceneIdOf: Map<string, string>) {
  const mate = fresh.onshape?.mate ?? '';
  const exact = remaining.get(mate);
  const candidates = exact?.size ? exact : remaining.get(mate.split('/').at(-1));

  if (!candidates?.size) return undefined;

  const children = new Set(fresh.child.map((id) => sceneIdOf.get(id)));

  for (const joint of candidates) {
    if (joint.child.some((id) => children.has(id))) return joint;
  }

  return undefined;
}

export function updatedJointIds({ joints, fresh, mine, sceneIdOf }: JointIdsInput): Map<string, string> {
  const taken = new Set(joints.map((j) => j.id));
  const remaining = remainingByMate(mine);
  const matches = new Map<string, RobotJoint>();

  for (const joint of fresh) {
    const matched = matchingJoint(joint, remaining, sceneIdOf);

    if (!matched) continue;

    matches.set(joint.id, matched);
    remaining.get(matched.onshape!.mate)!.delete(matched);
  }

  return new Map(
    fresh.map((joint) => {
      const exact = remaining.get(joint.onshape?.mate);
      const matched = matches.get(joint.id) ?? (exact?.size === 1 ? exact.values().next().value : undefined);

      if (matched) remaining.get(matched.onshape!.mate)!.delete(matched);

      return [joint.id, matched?.id ?? freeJointId(joint.id, taken)] as const;
    }),
  );
}
