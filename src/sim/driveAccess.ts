import { robotFacts } from '../cases/robotFit';
import type { JointValues, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { rigForWorker, type DriveSetup } from './drive';
import type { DriveClass } from './driveKeys';
import { footPoints } from './driveLegs';
import { armSetup, roverSetup } from './driveSetup';
import type { SimStats } from './engine';
import type { SimModel } from './mjcfTypes';

export const BIPED_DRIVE_NOTE = 'Two-legged robots can’t balance on a scripted walk. Drive needs a trained policy.';
export const WHEEL_LEG_DRIVE_NOTE = 'Robots balancing on wheeled legs need a trained policy to drive.';
export const NO_DRIVE_NOTE = 'Drive needs an arm, wheels or at least four legs.';
export const FELL_DRIVE_NOTE = 'This robot falls on its scripted walk. Drive needs a trained policy.';

const MIN_DRIVEN_LEGS = 4;

export const FALL_CHECK_SECONDS = 5;
export const FALL_CHECK_SETTLE_SECONDS = 1;

const MIN_FORWARD_M = 0.03;
const MAX_TILT = 35;
const MIN_HEIGHT_SHARE = 0.6;

export type DriveAccess =
  | { kind: 'ready'; cls: DriveClass; setup: DriveSetup; needsFallCheck: boolean; followPart: string | null }
  | { kind: 'refused'; reason: string };

export interface DriveInput {
  rig: Rig;
  parts: ScenePart[];
  model: SimModel;
  robotKey?: string;
  start?: JointValues;
}

function basePart(rig: Rig, parts: ScenePart[], key: string): string | null {
  const group = rig.robots.find((r) => r.key === key);
  const part = parts.find((p) => group?.parts.has(p.id) && !rig.ownerOf.has(p.id));

  return part?.id ?? null;
}

function legsAccess({ rig, parts, start }: DriveInput, robot: string, followPart: string | null): DriveAccess {
  const feet = footPoints(rig, parts, robot);

  if (feet.length === 2) return { kind: 'refused', reason: BIPED_DRIVE_NOTE };

  if (feet.length < MIN_DRIVEN_LEGS) return { kind: 'refused', reason: NO_DRIVE_NOTE };

  const setup: DriveSetup = { kind: 'legs', robot, rig: rigForWorker(rig), feet, start: start ?? {} };

  return { kind: 'ready', cls: 'legs', setup, needsFallCheck: true, followPart };
}

export function driveAccess(input: DriveInput): DriveAccess {
  const { rig, parts, model, robotKey, start } = input;
  const robot = model.robots.find((r) => r.key === robotKey) ?? model.robots[0];

  if (!robot) return { kind: 'refused', reason: NO_DRIVE_NOTE };

  const followPart = robot.floating ? basePart(rig, parts, robot.key) : null;
  const facts = robotFacts(rig, parts, robot.key);

  if (robot.morphology === 'wheel-legged') return { kind: 'refused', reason: WHEEL_LEG_DRIVE_NOTE };

  if (robot.morphology === 'wheeled') {
    const setup = roverSetup(rig, parts, robot.key);

    return { kind: 'ready', cls: 'rover', setup, needsFallCheck: false, followPart };
  }

  if (robot.morphology === 'legged') return legsAccess(input, robot.key, followPart);

  if (!facts.endEffector) return { kind: 'refused', reason: NO_DRIVE_NOTE };

  const setup = armSetup({
    rig,
    robot: robot.key,
    effector: facts.endEffector,
    joints: facts.armJoints,
    anchor: facts.anchor,
    reachMm: facts.reachMm,
    start,
  });

  return { kind: 'ready', cls: 'arm', setup, needsFallCheck: false, followPart };
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
