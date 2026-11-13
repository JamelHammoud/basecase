import type { DriveCommand, DriveSetup, RobotDrive } from '../sim/drive';
import { rigForWorker } from '../sim/drive';
import { footPoints } from '../sim/driveLegs';
import { armSetup, roverSetup } from '../sim/driveSetup';
import type { MjcfInput } from '../sim/mjcfTypes';
import type { Rig } from '../utils/kinematics';
import type { CastSlot, NamedSlot } from './caseCast';
import type { RobotFacts } from './robotFit';
import { caseSlots, type Case, type ReferenceCommand } from './schema';

interface DriveFor {
  slot: NamedSlot;
  cast: CastSlot;
  rig: Rig;
  parts: MjcfInput['parts'];
}

const MIN_DRIVEN_FEET = 4;

function groundDrive(rig: Rig, parts: MjcfInput['parts'], facts: RobotFacts, key: string): RobotDrive | null {
  if (facts.morphology === 'legged') {
    const feet = footPoints(rig, parts, key);

    return feet.length >= MIN_DRIVEN_FEET
      ? { kind: 'legs', robot: key, rig: rigForWorker(rig), feet, start: {} }
      : null;
  }

  return facts.wheels.length ? roverSetup(rig, parts, key) : null;
}

export function driveFor({ slot, cast, rig, parts }: DriveFor): RobotDrive | null {
  const { facts, effector } = cast;
  const key = cast.key ?? '';

  if (slot.needs.includes('arm') && effector && facts.armJoints.length) {
    const { armJoints: joints, anchor, reachMm, gripper } = facts;

    return armSetup({ rig, robot: key, effector, joints, anchor, reachMm, grip: gripper });
  }

  return groundDrive(rig, parts, facts, key);
}

export function teamDrive(setups: Array<RobotDrive | null>): DriveSetup | null {
  if (setups.length < 2) return setups[0] ?? null;

  const members = setups.flatMap((setup, slot) => (setup ? [{ slot, setup }] : []));

  return members.length ? { kind: 'team', members } : null;
}

export const slotIndexOf = (kase: Case, c: ReferenceCommand) =>
  Math.max(
    0,
    caseSlots(kase).findIndex((s) => s.id === c.slot),
  );

export const toCommand = (c: ReferenceCommand, slot = 0): DriveCommand => ({
  ...(slot ? { slot } : {}),
  v: c.v ?? [0, 0, 0],
  target: c.target,
  aux: c.aux,
});
