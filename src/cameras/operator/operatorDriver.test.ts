import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { rigForWorker } from '../../sim/drive';
import { poseSetup, upperJoints } from '../../sim/driveBody';
import type { DriveCommand } from '../../sim/driveTypes';
import { forwardKinematics, linkParts, type V3 } from '../../utils/kinematics';
import { humanoid } from '../../utils/mocap.fixtures';
import fixture from './fixtures/raiseRightArm.json';
import { elbowBend, fromRows, type LandmarkRow } from './landmarks';
import { createOperatorDriver } from './operatorDriver';
import { tabulatePoints } from './pointTable';

const frames = (fixture.frames as LandmarkRow[][]).map(fromRows);
const RAISED = 50;
const BENT = frames.length - 1;
const LEGS = /hip|knee|ankle/;

function run(driver: ReturnType<typeof createOperatorDriver>) {
  return frames.map((lm, f) => driver.step(lm, f / fixture.fps));
}

function humanoidRun() {
  const { rig, pointOf } = humanoid();
  const setup = poseSetup({ rig, robot: 'g1' });
  const driver = createOperatorDriver({
    kind: 'pose',
    rig: rigForWorker(rig),
    points: structuredClone(tabulatePoints(rig, pointOf)),
    joints: setup.joints.map((j) => j.id),
  });

  return { rig, setup, commands: run(driver) };
}

function wristAt(rig: ReturnType<typeof humanoid>['rig'], values: Record<string, number>): THREE.Vector3 {
  const posed = forwardKinematics(rig, { values });
  const hand = linkParts(rig, 'right_wrist_yaw_joint')[0];
  const part = rig.parts.find((p) => p.id === hand)!;

  return new THREE.Vector3(...part.position).applyMatrix4(posed.joint.get('right_wrist_yaw_joint')!);
}

const settled = (commands: Array<DriveCommand | null>) => commands.filter((c): c is DriveCommand => !!c);

describe('the camera driving a humanoid', () => {
  const { rig, setup, commands } = humanoidRun();

  it('waits for a still rest pose, then commands every frame', () => {
    expect(commands.slice(0, 9).every((c) => c === null)).toBe(true);
    expect(settled(commands).length).toBeGreaterThan(frames.length - 16);
    expect(commands[RAISED]?.joints).toBeDefined();
  });

  it('raises the right arm forward when the person does', () => {
    const rest = commands.find((c) => c)!.joints!;
    const raised = commands[RAISED]!.joints!;
    const restWrist = wristAt(rig, rest);
    const raisedWrist = wristAt(rig, raised);

    expect(raised.right_shoulder_pitch_joint).toBeLessThan(rest.right_shoulder_pitch_joint - 60);
    expect(raisedWrist.z - restWrist.z).toBeGreaterThan(250);
    expect(raisedWrist.y - restWrist.y).toBeGreaterThan(250);
    expect(Math.abs(raised.left_shoulder_pitch_joint - rest.left_shoulder_pitch_joint)).toBeLessThan(10);
  });

  it('bends the elbow within 10° of the person’s', () => {
    for (const f of [RAISED, BENT]) {
      const person = elbowBend(frames[f], 'right');

      expect(Math.abs(Math.abs(commands[f]!.joints!.right_elbow_joint) - person)).toBeLessThan(10);
    }

    expect(elbowBend(frames[BENT], 'right')).toBeGreaterThan(45);
  });

  it('never commands the legs, so they and the base stay still', () => {
    const ids = setup.joints.map((j) => j.id);

    expect(ids.some((id) => LEGS.test(id))).toBe(false);
    expect(ids).toContain('waist_yaw_joint');
    expect(upperJoints(rig).map((j) => j.id)).toEqual(ids);

    for (const c of settled(commands)) {
      expect(Object.keys(c.joints!).some((id) => LEGS.test(id))).toBe(false);
      expect(c.v).toEqual([0, 0, 0]);
      expect(c.target).toBeUndefined();
    }
  });

  it('closes the grip when the left hand pinches', () => {
    expect(commands[30]!.aux![1]).toBeLessThan(0.2);
    expect(commands[BENT]!.aux![1]).toBeGreaterThan(0.8);
  });
});

describe('the camera driving a fixed arm', () => {
  const anchor: V3 = [0, 120, 0];
  const reachMm = 300;
  const commands = settled(run(createOperatorDriver({ kind: 'arm', anchor, reachMm })));

  it('aims the hand where the person’s right wrist is, scaled to the arm’s reach', () => {
    const rest = commands[5].target!;
    const raised = commands[RAISED].target!;
    const reach = (t: V3) => Math.hypot(...t.map((x, i) => x - anchor[i]));

    expect(rest[1]).toBeGreaterThanOrEqual(10);
    expect(raised[2] - anchor[2]).toBeGreaterThan(reachMm * 0.85);
    expect(Math.abs(raised[1] - anchor[1])).toBeLessThan(reachMm * 0.2);
    expect(reach(raised)).toBeLessThanOrEqual(reachMm * 0.98 + 0.01);
    expect(commands.at(-1)!.aux![1]).toBeGreaterThan(0.8);
  });
});
