import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { caseRobot } from '../../cases/testing';
import { lensOf } from '../../datasets/cameras';
import { driveAccess } from '../../sim/driveAccess';
import { PoseDrive, poseSetup } from '../../sim/drivePose';
import { CONTROL_DT } from '../../sim/driveTiming';
import { buildMjcf } from '../../sim/mjcf';
import type { JointValues } from '../../types/robotics';
import { buildRig, forwardKinematics, type Rig } from '../../utils/kinematics';
import { createFaceFollower, headTurn, type FaceFollow } from './faceFollow';
import { FACE_CENTRE, FACE_FRAMES, FACE_FPS, faceOffCentre } from './fixtures/faceOffCentre';
import { PAN_JOINT, PAN_TILT_CAMERA, panTilt, panTiltJoints, TILT_JOINT } from './fixtures/panTilt';
import { bearingOf } from './laptopLens';
import { lookJoints } from './lookJoints';

const DEG = 180 / Math.PI;
const UP = new THREE.Vector3(0, 1, 0);

function scene() {
  const { parts, project } = panTilt();
  const joints = project.joints!;
  const rig = buildRig(joints, parts);

  return { parts, joints, rig, robot: rig.robots[0].key };
}

function gaze(rig: Rig, values: JointValues) {
  const camera = rig.parts.find((p) => p.id === PAN_TILT_CAMERA)!;
  const lens = lensOf(camera)!;
  const right = lens.axis.clone().cross(UP).normalize();
  const posed = forwardKinematics(rig, { values }).joint.get(rig.ownerOf.get(camera.id)!)!;
  const forward = lens.axis.clone().transformDirection(posed);

  return {
    right: Math.atan2(forward.dot(right), forward.dot(lens.axis)) * DEG,
    up: Math.asin(forward.dot(UP)) * DEG,
  };
}

function drive(rig: Rig, robot: string, follows: FaceFollow[]) {
  const pose = new PoseDrive(poseSetup(rig, { robot }));
  const gazes: Array<ReturnType<typeof gaze>> = [];

  for (let time = 0; time < FACE_FRAMES / FACE_FPS; time += CONTROL_DT) {
    const follow = follows[Math.min(follows.length - 1, Math.floor(time * FACE_FPS))];

    pose.command({ v: [0, 0, 0], ...(follow.joints ? { joints: follow.joints } : {}) });
    gazes.push(gaze(rig, pose.tick(time).values ?? {}));
  }

  return gazes;
}

describe('following a face with a pan-tilt camera', () => {
  const { parts, joints, rig, robot } = scene();
  const look = lookJoints(rig, parts, robot)!;
  const follower = createFaceFollower({ kind: 'joints', rig, points: {}, joints: [PAN_JOINT, TILT_JOINT], look });
  const follows = faceOffCentre().map((s) => follower.step(s)!);
  const [right, up] = bearingOf([FACE_CENTRE[0] - 0.5, FACE_CENTRE[1] - 0.5]);

  it('finds the pan and tilt joints, by name or by walking from the camera', () => {
    expect(look).toMatchObject({ pan: PAN_JOINT, tilt: TILT_JOINT });

    const plain: Record<string, string> = { [PAN_JOINT]: 'base_yaw', [TILT_JOINT]: 'head_pitch' };
    const renamed = panTiltJoints().map((j) => ({
      ...j,
      id: plain[j.id],
      name: plain[j.id],
      ...(j.parentJoint ? { parentJoint: plain[j.parentJoint] } : {}),
    }));
    const renamedRig = buildRig(renamed, parts);

    expect(lookJoints(renamedRig, parts, renamedRig.robots[0].key)).toMatchObject({
      pan: 'base_yaw',
      tilt: 'head_pitch',
    });
  });

  it('gives a pan-tilt camera the pose drive', () => {
    const model = buildMjcf({
      ...caseRobot({ id: 'pan-tilt', parts, joints, expect: { morphology: 'fixed', stand: 'n/a', walk: 'n/a' } }),
      rig,
      project: panTilt().project,
    });

    expect(driveAccess({ rig, parts, model, pose: true })).toMatchObject({ kind: 'ready', cls: 'pose' });
  });

  it('reads the face right of and above centre, facing the camera', () => {
    const last = follows.at(-1)!;

    expect(right).toBeGreaterThan(10);
    expect(up).toBeGreaterThan(5);
    expect(last.bearing[0]).toBeCloseTo(right, 0);
    expect(last.bearing[1]).toBeCloseTo(up, 0);
    expect(Math.abs(last.yaw)).toBeLessThan(1);
    expect(Math.abs(last.pitch)).toBeLessThan(1);
  });

  it('turns the camera toward the face until it’s centred', () => {
    const errors = drive(rig, robot, follows).map((g) => Math.hypot(g.right - right, g.up - up));
    const centred = errors.findIndex((e) => e < 1);

    expect(centred).toBeGreaterThan(0);

    for (let i = 1; i <= centred; i++) expect(errors[i], `step ${i}`).toBeLessThan(errors[i - 1]);

    expect(Math.max(...errors.slice(centred))).toBeLessThan(1);
  });

  it('reads the head’s yaw and pitch from the transformation matrix', () => {
    const turned = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-10 / DEG, 20 / DEG, 0, 'YXZ'));
    const { yaw, pitch } = headTurn(turned.toArray());

    expect(yaw).toBeCloseTo(20, 5);
    expect(pitch).toBeCloseTo(10, 5);
  });
});
