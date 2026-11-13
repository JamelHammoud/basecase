import { findGripper, type Gripper } from '../cases/gripper';
import { robotFacts } from '../cases/robotFit';
import type { JointValues, RobotJoint, ScenePart } from '../types/robotics';
import { isMovable, jointRange, robotRig, type Rig } from '../utils/kinematics';
import { autoMapRobot } from '../utils/mocapBones';
import { driveAccess, type DriveAccess, type VelocityDrive } from './driveAccess';
import type { PoseSetup } from './drivePose';
import type { SimModel } from './mjcfTypes';
import { isWheelJoint } from './morphology';

function below(rig: Rig, roots: Set<string>, id: string): boolean {
  for (let at: string | null | undefined = id; at; at = rig.parentOf.get(at)) {
    if (roots.has(at)) return true;
  }

  return false;
}

export function upperJoints(rig: Rig): RobotJoint[] {
  const map = autoMapRobot(rig);
  const hips = new Set([map.leftHip, map.rightHip].filter((id): id is string => !!id));
  const byId = new Map(rig.parts.map((p) => [p.id, p]));

  return rig.joints.filter((j) => isMovable(j) && !below(rig, hips, j.id) && !isWheelJoint(j, byId, rig));
}

export const hasArms = (rig: Rig) => {
  const map = autoMapRobot(rig);

  return !!(map.leftShoulder || map.rightShoulder) && !!(map.leftElbow || map.rightElbow);
};

function grippers(rig: Rig, joints: RobotJoint[]): Gripper[] {
  const byId = new Map(rig.parts.map((p) => [p.id, p]));
  const found: Gripper[] = [];
  let left = joints;

  for (let next = findGripper(rig, left, byId); next; next = findGripper(rig, left, byId)) {
    const palm = next.palm;

    found.push(next);
    left = left.filter((j) => rig.parentOf.get(j.id) !== palm);
  }

  return found;
}

export interface PoseSetupInput {
  rig: Rig;
  robot: string;
  start?: JointValues;
  under?: PoseSetup['under'];
}

export function poseSetup({ rig, robot, start = {}, under }: PoseSetupInput): PoseSetup {
  const upper = upperJoints(rig);
  const joints = upper.map((j) => ({
    id: j.id,
    range: jointRange(j),
    ...(j.type === 'prismatic' ? { prismatic: true } : {}),
  }));
  const jaws = grippers(rig, upper).flatMap((g) => g.jaws);

  return { kind: 'pose', robot, joints, start, ...(jaws.length ? { jaws } : {}), ...(under ? { under } : {}) };
}

export interface BodyInput {
  rig: Rig;
  parts: ScenePart[];
  model: SimModel;
  robotKey?: string;
  start?: JointValues;
  velocity?: VelocityDrive | null;
}

export function bodyOffer(rig: Rig, parts: ScenePart[], robotKey?: string): boolean {
  if (!rig.robots.length) return false;

  const key = robotKey ?? rig.robots[0].key;

  if (hasArms(robotRig(rig, key))) return true;

  const facts = robotFacts(rig, parts, key);

  return facts.morphology === 'fixed' && facts.endEffector !== null;
}

export interface PinInput {
  rig: Rig;
  parts: ScenePart[];
  robotKey?: string;
  velocity?: VelocityDrive | null;
}

export function bodyPin({ rig, parts, robotKey, velocity }: PinInput): string | null {
  const key = robotKey ?? rig.robots[0]?.key;

  if (!key || velocity) return null;

  const own = robotRig(rig, key);

  if (!hasArms(own.joints.length ? own : rig)) return null;

  return robotFacts(rig, parts, key).morphology === 'fixed' ? null : key;
}

const armOnly = (access: DriveAccess): DriveAccess =>
  access.kind === 'ready' && access.cls === 'arm' ? access : { kind: 'none' };

export function bodyAccess(input: BodyInput): DriveAccess {
  const { rig, model, robotKey, velocity } = input;
  const robot = model.robots.find((r) => r.key === robotKey) ?? model.robots[0];

  if (!robot) return { kind: 'none' };

  const own = robotRig(rig, robot.key);

  if (!hasArms(own.joints.length ? own : rig)) return armOnly(driveAccess({ ...input, velocity: null }));

  const floats = robot.morphology !== 'fixed';
  const under = velocity && floats ? { policy: velocity.policy, robot: robot.key } : undefined;
  const setup = poseSetup({ rig: own.joints.length ? own : rig, robot: robot.key, start: input.start, under });

  return {
    kind: 'ready',
    cls: 'pose',
    setup,
    needsFallCheck: false,
    followPart: null,
    ...(floats && !under ? { pin: robot.key } : {}),
  };
}
