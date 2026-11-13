import { classifyRobot } from '../sim/morphology';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { buildRig, isMovable, resolveJoints, type Rig, type RobotGroup } from '../utils/kinematics';

export interface FollowerArm {
  robot: RobotGroup;
  arm: RobotJoint[];
  gripper: RobotJoint | null;
}

const GRIPPER_WORD = /grip|jaw|finger|claw|pinch/i;

function movableParent(rig: Rig, j: RobotJoint): string | null {
  for (let id = rig.parentOf.get(j.id); id; id = rig.parentOf.get(id)) {
    const parent = rig.byId.get(id);

    if (parent && isMovable(parent)) return parent.id;
  }

  return null;
}

function serialChain(rig: Rig, joints: RobotJoint[]): RobotJoint[] | null {
  const parentOf = new Map(joints.map((j) => [j.id, movableParent(rig, j)]));
  const roots = joints.filter((j) => !parentOf.get(j.id));

  if (roots.length !== 1) return null;

  const chain = [roots[0]];

  for (;;) {
    const last = chain[chain.length - 1];
    const next = joints.filter((j) => parentOf.get(j.id) === last.id);

    if (next.length > 1) return null;

    if (!next.length) return chain;

    chain.push(next[0]);
  }
}

function isGripper(j: RobotJoint, byId: Map<string, ScenePart>): boolean {
  if (j.type === 'prismatic') return true;

  return [j.name, j.id, ...j.child.map((id) => byId.get(id)?.name ?? '')].some((s) => GRIPPER_WORD.test(s));
}

function followerOf(rig: Rig, robot: RobotGroup, byId: Map<string, ScenePart>): FollowerArm | null {
  if (classifyRobot(robot, rig, byId) !== 'fixed') return null;

  const movable = rig.joints.filter((j) => rig.robotOf.get(j.id) === robot.key && isMovable(j));
  const chain = movable.length >= 2 ? serialChain(rig, movable) : null;

  if (!chain) return null;

  const tip = chain[chain.length - 1];
  const gripper = chain.length > 2 && isGripper(tip, byId) ? tip : null;

  return { robot, arm: gripper ? chain.slice(0, -1) : chain, gripper };
}

export function armsOfRig(rig: Rig, parts: ScenePart[]): FollowerArm[] {
  const byId = new Map(parts.map((p) => [p.id, p]));

  return rig.robots.flatMap((robot) => followerOf(rig, robot, byId) ?? []);
}

export const followerArms = (parts: ScenePart[], joints: RobotJoint[]): FollowerArm[] =>
  armsOfRig(buildRig(resolveJoints(joints, parts), parts), parts);

export function followerArm(parts: ScenePart[], joints: RobotJoint[], key?: string): FollowerArm | null {
  const arms = followerArms(parts, joints);

  return (key ? arms.find((a) => a.robot.key === key) : arms[0]) ?? null;
}
