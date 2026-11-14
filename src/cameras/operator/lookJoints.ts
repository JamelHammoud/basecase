import * as THREE from 'three';
import { lensOf } from '../../datasets/cameras';
import { isCameraPart } from '../../routines/capabilities';
import type { InputLook } from '../../sim/inputTypes';
import type { RobotJoint, ScenePart } from '../../types/robotics';
import { forwardKinematics, isMovable, type Rig } from '../../utils/kinematics';

const PAN = /pan/i;
const TILT = /tilt/i;
const PROBE_DEG = 10;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const named = (j: RobotJoint, pattern: RegExp) => pattern.test(j.name) || pattern.test(j.id);

function cameraOf(rig: Rig, parts: ScenePart[], robot: string): ScenePart | null {
  const group = rig.robots.find((r) => r.key === robot);

  return parts.find((p) => !!group?.parts.has(p.id) && isCameraPart(p)) ?? null;
}

function revoluteChain(rig: Rig, part: string): string[] {
  const chain: string[] = [];
  let id = rig.ownerOf.get(part) ?? null;

  while (id) {
    if (rig.byId.get(id)?.type === 'revolute') chain.push(id);

    id = rig.parentOf.get(id) ?? null;
  }

  return chain;
}

function namedPair(rig: Rig, robot: string): [string, string] | null {
  const movable = rig.joints.filter((j) => isMovable(j) && rig.robotOf.get(j.id) === robot);
  const pan = movable.find((j) => named(j, PAN));
  const tilt = movable.find((j) => j !== pan && named(j, TILT));

  return pan && tilt ? [pan.id, tilt.id] : null;
}

function turnSign(rig: Rig, options: { joint: string; camera: ScenePart; toward: 'right' | 'up' }): 1 | -1 {
  const lens = lensOf(options.camera);
  const owner = rig.ownerOf.get(options.camera.id);

  if (!lens || !owner) return 1;

  const right = lens.axis.clone().cross(WORLD_UP);

  if (right.lengthSq() < 1e-6) return 1;

  right.normalize();

  const goal = options.toward === 'right' ? right : right.clone().cross(lens.axis).normalize();
  const posed = forwardKinematics(rig, { values: { [options.joint]: PROBE_DEG } }).joint.get(owner);
  const turned = lens.axis.clone().transformDirection(posed ?? new THREE.Matrix4());

  return turned.dot(goal) >= 0 ? 1 : -1;
}

function pairOf(rig: Rig, robot: string, camera: ScenePart | null): [string, string | null] | null {
  const pair = namedPair(rig, robot);

  if (pair) return pair;

  const [nearer, further] = camera ? revoluteChain(rig, camera.id) : [];

  if (!nearer) return null;

  return further ? [further, nearer] : [nearer, null];
}

export function lookJoints(rig: Rig, parts: ScenePart[], robot: string): InputLook | null {
  const camera = cameraOf(rig, parts, robot);
  const pair = pairOf(rig, robot, camera);

  if (!pair) return null;

  const [pan, tilt] = pair;
  const sign = (joint: string | null, toward: 'right' | 'up') =>
    joint && camera ? turnSign(rig, { joint, camera, toward }) : 1;

  return { pan, tilt, panSign: sign(pan, 'right'), tiltSign: sign(tilt, 'up') };
}
