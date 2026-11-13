import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { poseJoints } from '../../sim/drivePose';
import type { JointValues } from '../../types/robotics';
import { buildRig, forwardKinematics, type Rig, type V3 } from '../../utils/kinematics';
import { humanoid } from '../../utils/mocap.fixtures';
import { elbowFlexion, RAISE_FRAMES, RAISED_AT, raiseRightArm } from './fixtures/raiseRightArm';
import { createPoseFollower, type PoseFollow } from './poseFollow';
import { POSE } from './poseLandmarks';
import { pointTable } from './pointTable';

const LEG = /^(left|right)_(hip|knee|ankle)_/;

function follow(rig: Rig, pointOf: ReturnType<typeof humanoid>['pointOf']) {
  const joints = poseJoints(rig).map((j) => j.id);
  const follower = createPoseFollower({ kind: 'joints', rig, points: pointTable(rig, pointOf), joints });

  return { joints, outputs: raiseRightArm().map((s) => follower.step(s)) };
}

const flexingElbows = (h: ReturnType<typeof humanoid>) =>
  buildRig(
    h.joints.map((j) => (j.id.endsWith('elbow_joint') ? { ...j, range: [-120, 60] as [number, number] } : j)),
    h.parts,
  );

function posed(rig: Rig, values: JointValues, joint: string): THREE.Vector3 {
  const origin = rig.byId.get(joint)!.origin;

  return new THREE.Vector3(...origin).applyMatrix4(forwardKinematics(rig, { values }).joint.get(joint)!);
}

function handAt(rig: Rig, values: JointValues): THREE.Vector3 {
  const [x, y, z] = rig.byId.get('right_wrist_yaw_joint')!.origin;

  return new THREE.Vector3(x, y - 70, z).applyMatrix4(
    forwardKinematics(rig, { values }).joint.get('right_wrist_yaw_joint')!,
  );
}

function robotFlexion(rig: Rig, values: JointValues): number {
  const shoulder = posed(rig, values, 'right_shoulder_pitch_joint');
  const elbow = posed(rig, values, 'right_elbow_joint');
  const wrist = posed(rig, values, 'right_wrist_roll_joint');

  return THREE.MathUtils.radToDeg(elbow.clone().sub(shoulder).angleTo(wrist.clone().sub(elbow)));
}

const firstFollow = (outputs: Array<PoseFollow | null>) => outputs.find((o): o is PoseFollow => !!o)!;

describe('createPoseFollower on a humanoid', () => {
  const h = humanoid();
  const { joints, outputs } = follow(h.rig, h.pointOf);
  const rest = firstFollow(outputs);
  const raised = outputs[RAISED_AT]!;
  const last = outputs[RAISE_FRAMES - 1]!;

  it('waits for a steady rest pose, then follows every frame', () => {
    expect(outputs[0]).toBeNull();
    expect(outputs.findIndex((o) => !!o)).toBeLessThan(15);
    expect(outputs.slice(15).every((o) => !!o?.joints)).toBe(true);
  });

  it('raises the right hand forward and up, turning the shoulder pitch the way that moves it there', () => {
    const before = handAt(h.rig, rest.joints!);
    const after = handAt(h.rig, raised.joints!);
    const turn = raised.joints!.right_shoulder_pitch_joint - rest.joints!.right_shoulder_pitch_joint;
    const nudged = handAt(h.rig, { right_shoulder_pitch_joint: Math.sign(turn) * 30 });

    expect(after.z - before.z).toBeGreaterThan(250);
    expect(after.y - before.y).toBeGreaterThan(250);
    expect(Math.abs(turn)).toBeGreaterThan(70);
    expect(nudged.z).toBeGreaterThan(handAt(h.rig, {}).z + 50);
    expect(Math.abs(raised.joints!.left_shoulder_pitch_joint - rest.joints!.left_shoulder_pitch_joint)).toBeLessThan(
      10,
    );
  });

  it('bends the robot elbow as far as the person bends theirs', () => {
    const rig = flexingElbows(h);
    const run = follow(rig, h.pointOf);
    const end = run.outputs[RAISE_FRAMES - 1]!.joints!;
    const person = elbowFlexion(raiseRightArm()[RAISE_FRAMES - 1].world);

    expect(person).toBeGreaterThan(80);
    expect(Math.abs(robotFlexion(rig, end) - person)).toBeLessThan(10);
    expect(Math.abs(Math.abs(end.right_elbow_joint) - person)).toBeLessThan(10);
  });

  it('stops the elbow at its limit when the person bends past it', () => {
    expect(last.joints!.right_elbow_joint).toBeCloseTo(-60, 0);
    expect(robotFlexion(h.rig, last.joints!)).toBeCloseTo(60, 0);
  });

  it('leaves the legs and base to the robot', () => {
    const legs = h.rig.joints.filter((j) => LEG.test(j.id)).map((j) => j.id);

    expect(legs).toHaveLength(12);
    expect(joints.filter((id) => legs.includes(id))).toEqual([]);
    expect(outputs.flatMap((o) => Object.keys(o?.joints ?? {})).filter((id) => legs.includes(id))).toEqual([]);
  });

  it('closes the grip on a pinch', () => {
    expect(rest.grip).toBeLessThan(0.05);
    expect(last.grip).toBeGreaterThanOrEqual(0.8);
  });
});

describe('createPoseFollower on a fixed arm', () => {
  const start: V3 = [0, 300, 200];
  const reachMm = 400;

  it('moves the tip forward and up from its start as the right arm rises', () => {
    const follower = createPoseFollower({ kind: 'tip', start, reachMm });
    const targets = raiseRightArm().map((s) => follower.step(s)?.target);
    const raised = targets[RAISED_AT]!;

    expect(targets[0]).toEqual(start);
    expect(raised[2] - start[2]).toBeGreaterThan(reachMm * 0.6);
    expect(raised[1] - start[1]).toBeGreaterThan(reachMm * 0.6);
    expect(Math.abs(raised[0] - start[0])).toBeLessThan(reachMm * 0.1);

    for (const t of targets)
      expect(new THREE.Vector3(...t!).distanceTo(new THREE.Vector3(...start))).toBeLessThan(reachMm * 2);
  });

  it('holds while the wrist is out of sight', () => {
    const follower = createPoseFollower({ kind: 'tip', start, reachMm });
    const [first, second] = raiseRightArm();
    const hidden = second.world.map((p, i) => (i === POSE.rightWrist ? { ...p, visibility: 0.1 } : p));

    expect(follower.step(first)).not.toBeNull();
    expect(follower.step({ ...second, world: hidden })).toBeNull();
  });
});
