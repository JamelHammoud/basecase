import { lookJoints } from '../cameras/operator/lookJoints';
import { robotFacts } from '../cases/robotFit';
import type { JointValues, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { rigForWorker, type RobotDrive } from './drive';
import type { DriveClass } from './driveKeys';
import { footPoints } from './driveLegs';
import { hasArms, poseSetup, type PoseSetup } from './drivePose';
import { armSetup, roverSetup } from './driveSetup';
import type { DriveCommand } from './driveTypes';
import type { SimStats } from './engine';
import type { SimModel } from './mjcfTypes';
import type { PolicySpec } from './policy';

const MIN_DRIVEN_LEGS = 4;

export const FALL_CHECK_SECONDS = 5;
export const FALL_CHECK_SETTLE_SECONDS = 1;

const MIN_FORWARD_M = 0.03;
const MAX_TILT = 35;
const MIN_HEIGHT_SHARE = 0.6;
const STRAFE_SHARE = 0.25;
const TURN_RAD_S = 0.6;

export interface VelocityDrive {
  policy: PolicySpec;
  topSpeed: number;
}

export type DriveAccess =
  | {
      kind: 'ready';
      cls: DriveClass;
      setup: RobotDrive;
      needsFallCheck: boolean;
      followPart: string | null;
      pin?: string;
    }
  | {
      kind: 'policy';
      cls: 'legs';
      velocity: VelocityDrive;
      robot: string;
      followPart: string | null;
      pose?: PoseSetup;
    }
  | { kind: 'teach' }
  | { kind: 'none' };

export type DriveOffer = 'drive' | 'teach' | 'none';

export interface DriveInput {
  rig: Rig;
  parts: ScenePart[];
  model: SimModel;
  robotKey?: string;
  start?: JointValues;
  velocity?: VelocityDrive | null;
  pose?: boolean;
}

function basePart(rig: Rig, parts: ScenePart[], key: string): string | null {
  const group = rig.robots.find((r) => r.key === key);
  const part = parts.find((p) => group?.parts.has(p.id) && !rig.ownerOf.has(p.id));

  return part?.id ?? null;
}

function legsAccess({ rig, parts, start }: DriveInput, robot: string, followPart: string | null): DriveAccess {
  const feet = footPoints(rig, parts, robot);

  if (feet.length < MIN_DRIVEN_LEGS) return { kind: 'teach' };

  const setup: RobotDrive = { kind: 'legs', robot, rig: rigForWorker(rig), feet, start: start ?? {} };

  return { kind: 'ready', cls: 'legs', setup, needsFallCheck: true, followPart };
}

function armAccess(input: DriveInput, robot: string): DriveAccess {
  const facts = robotFacts(input.rig, input.parts, robot);

  if (!facts.endEffector) return { kind: 'none' };

  const setup = armSetup({
    rig: input.rig,
    robot,
    effector: facts.endEffector,
    joints: facts.armJoints,
    anchor: facts.anchor,
    reachMm: facts.reachMm,
    start: input.start,
    grip: facts.gripper,
  });

  return { kind: 'ready', cls: 'arm', setup, needsFallCheck: false, followPart: null };
}

function fixedArmlessAccess(input: DriveInput, robot: string): DriveAccess {
  const { rig, parts, start } = input;
  const facts = robotFacts(rig, parts, robot);
  const look = lookJoints(rig, parts, robot);
  const aimsCamera = !!look && facts.armJoints.every((id) => id === look.pan || id === look.tilt);

  if (!aimsCamera && (facts.endEffector || !look)) return armAccess(input, robot);

  return {
    kind: 'ready',
    cls: 'pose',
    setup: poseSetup(rig, { robot, start }),
    needsFallCheck: false,
    followPart: null,
  };
}

function poseAccess(input: DriveInput, robot: SimModel['robots'][number], followPart: string | null): DriveAccess {
  const { rig, velocity, start } = input;

  if (!hasArms(rig)) return fixedArmlessAccess(input, robot.key);

  const pose = poseSetup(rig, { robot: robot.key, start });

  if (velocity && robot.floating) return { kind: 'policy', cls: 'legs', velocity, robot: robot.key, followPart, pose };

  const pin = robot.floating ? { pin: robot.key } : {};

  return { kind: 'ready', cls: 'pose', setup: pose, needsFallCheck: false, followPart: null, ...pin };
}

export function driveAccess(input: DriveInput): DriveAccess {
  const { rig, parts, model, robotKey, velocity } = input;
  const robot = model.robots.find((r) => r.key === robotKey) ?? model.robots[0];

  if (!robot) return { kind: 'none' };

  const followPart = robot.floating ? basePart(rig, parts, robot.key) : null;

  const posable = hasArms(rig) || robot.morphology === 'fixed';

  if (input.pose && posable) return poseAccess(input, robot, followPart);

  if (velocity && robot.floating) return { kind: 'policy', cls: 'legs', velocity, robot: robot.key, followPart };

  if (robot.morphology === 'wheel-legged') return { kind: 'teach' };

  if (robot.morphology === 'wheeled') {
    const setup = roverSetup(rig, parts, robot.key);

    return { kind: 'ready', cls: 'rover', setup, needsFallCheck: false, followPart };
  }

  if (robot.morphology === 'legged') return legsAccess(input, robot.key, followPart);

  return armAccess(input, robot.key);
}

export function driveOffer(options: {
  rig: Rig;
  parts: ScenePart[];
  robotKey?: string;
  velocityReady: boolean;
}): DriveOffer {
  const { rig, parts, robotKey, velocityReady } = options;

  if (!rig.robots.length) return 'none';

  const facts = robotFacts(rig, parts, robotKey);
  const walks = facts.morphology === 'legged' || facts.morphology === 'wheel-legged';

  if (walks && velocityReady) return 'drive';

  if (facts.morphology === 'wheel-legged') return 'teach';

  if (facts.morphology === 'legged')
    return footPoints(rig, parts, robotKey).length < MIN_DRIVEN_LEGS ? 'teach' : 'drive';

  return facts.morphology === 'wheeled' || facts.endEffector ? 'drive' : 'none';
}

export function poseOffer(options: { rig: Rig; parts: ScenePart[]; robotKey?: string }): boolean {
  const { rig, parts, robotKey } = options;

  if (!rig.robots.length) return false;

  const facts = robotFacts(rig, parts, robotKey);

  return hasArms(rig) || (facts.morphology === 'fixed' && !!facts.endEffector);
}

export function posePin(options: { rig: Rig; parts: ScenePart[]; robotKey?: string }): string | null {
  const { rig, parts, robotKey } = options;
  const robot = rig.robots.find((r) => r.key === robotKey) ?? rig.robots[0];

  if (!robot || !hasArms(rig)) return null;

  return robotFacts(rig, parts, robot.key).morphology === 'fixed' ? null : robot.key;
}

export const withVelocity = (offer: DriveOffer, velocityReady: boolean): DriveOffer =>
  offer === 'teach' && velocityReady ? 'drive' : offer;

export function policyCommand(command: DriveCommand, topSpeed: number): DriveCommand {
  const [forward, left, turn] = command.v;

  const v: DriveCommand['v'] = [Math.max(0, forward) * topSpeed, left * STRAFE_SHARE * topSpeed, turn * TURN_RAD_S];

  return command.joints ? { v, joints: command.joints } : { v };
}

export function fallCheckPassed(stats: SimStats, restHeightM: number, robotKey?: string): boolean {
  const r = stats.robots.find((x) => x.key === robotKey) ?? stats.robots[0];

  if (!r) return false;

  return (
    r.fellAt === null &&
    r.tilt < MAX_TILT &&
    r.forward > MIN_FORWARD_M &&
    restHeightM + r.height > restHeightM * MIN_HEIGHT_SHARE
  );
}

export const fallCheckCommands = () => [
  { at: FALL_CHECK_SETTLE_SECONDS, command: { v: [1, 0, 0] as [number, number, number] } },
];
