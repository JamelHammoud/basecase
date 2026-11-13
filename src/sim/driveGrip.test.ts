import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { robotFacts } from '../cases/robotFit';
import { buildRig, forwardKinematics, type V3 } from '../utils/kinematics';
import { createDrive, type DriveCommand } from './drive';
import { commandFromKeys, commandFromPad, sameCommand } from './driveKeys';
import { armSetup } from './driveSetup';
import { fixtureRobots } from './fixtures/robots';

function armDrive(id: string) {
  const arm = fixtureRobots().find((r) => r.id === id)!;
  const rig = buildRig(arm.joints, arm.parts);
  const facts = robotFacts(rig, arm.parts);
  const setup = armSetup({
    rig,
    robot: rig.robots[0].key,
    effector: facts.endEffector!,
    joints: facts.armJoints,
    anchor: facts.anchor,
    reachMm: facts.reachMm,
    grip: facts.gripper,
  });

  return { drive: createDrive(setup), rig, facts };
}

function run(drive: ReturnType<typeof createDrive>, command: DriveCommand, seconds: number, from = 0) {
  drive.command(command);

  let values = {};

  for (let t = from; t < from + seconds; t += 0.02) values = drive.tick(t).values ?? values;

  return values as Record<string, number>;
}

describe('gripping in live drive', () => {
  it('Space and the pad’s first button close the gripper', () => {
    expect(commandFromKeys(new Set([' ']), 'arm').aux?.[1]).toBe(1);
    expect(commandFromPad({ axes: [], buttons: [{ pressed: true, value: 1 }] }, 'arm').aux?.[1]).toBe(1);
  });

  it('sends a new target even when the keys are the same', () => {
    const at = (z: number): DriveCommand => ({ v: [0, 0, 0], target: [0, 40, z], aux: [0, 1] });

    expect(sameCommand(at(200), at(200))).toBe(true);
    expect(sameCommand(at(200), at(260))).toBe(false);
    expect(sameCommand(at(200), { v: [0, 0, 0], aux: [0, 1] })).toBe(false);
  });

  it('closes the jaws toward their closing limits while gripping, and opens them on release', () => {
    const { drive } = armDrive('arm-6dof');
    const shut = run(drive, { v: [0, 0, 0], aux: [0, 1] }, 0.1);
    const open = run(drive, { v: [0, 0, 0], aux: [0, 0] }, 0.1, 0.2);

    expect([shut.finger_left, shut.finger_right]).toEqual([25, -25]);
    expect([open.finger_left, open.finger_right]).toEqual([0, 0]);
  });

  it('carries the hand to a target low and ahead with the gripper pointing down, fingers across the reach', () => {
    const { drive, rig, facts } = armDrive('arm-6dof');
    const target: V3 = [0, 40, 200];
    const values = run(drive, { v: [0, 0, 0], target, aux: [0, 1] }, 3);
    const posed = forwardKinematics(rig, { values });
    const hand = posed.joint.get('arm5')!;
    const at = (p: V3) => new THREE.Vector3(...p).applyMatrix4(hand);
    const centre = at(facts.gripper!.centre);
    const approach = centre
      .clone()
      .sub(at([0, 400, 0]))
      .normalize();
    const across = at([1, 495, 0]).sub(centre).normalize();

    expect(centre.distanceTo(new THREE.Vector3(...target))).toBeLessThan(3);
    expect(approach.y).toBeLessThan(-0.95);
    expect(Math.abs(across.x)).toBeGreaterThan(0.95);
  });

  it('drives an arm without a gripper the same whether or not Space is held', () => {
    const target: V3 = [0, 120, 120];
    const gripping = run(armDrive('arm-3dof').drive, { v: [0, 0, 0], target, aux: [0, 1] }, 1);
    const plain = run(armDrive('arm-3dof').drive, { v: [0, 0, 0], target }, 1);

    expect(gripping).toEqual(plain);
  });
});
