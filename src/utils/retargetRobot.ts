import * as THREE from 'three';
import type { RobotJoint } from '../types/robotics';
import type { PointOf } from './animationGoals';
import { isMovable, linkParts, type Rig, type V3 } from './kinematics';
import { KEYPOINTS, type Keypoint } from './mocapBones';

export type KeyMap = Partial<Record<Keypoint, string>>;
export type Landmarks = Map<Keypoint, THREE.Vector3>;

export interface RobotRef {
  rig: Rig;
  pointOf: PointOf;
  joints: KeyMap;
}

export interface RobotLandmarks extends RobotRef {
  rp: Landmarks;
  torsoJoints: string[];
  neckJoints: string[];
}

export interface Carrier {
  partId: string;
  point: V3;
}

type LimbEnd = readonly ['left' | 'right', 'Wrist' | 'Toe', Keypoint];

const LIMB_ENDS: LimbEnd[] = [
  ['left', 'Wrist', 'leftElbow'],
  ['right', 'Wrist', 'rightElbow'],
  ['left', 'Toe', 'leftAnkle'],
  ['right', 'Toe', 'rightAnkle'],
];

const deeperFirst = (rig: Rig) => (a: RobotJoint, b: RobotJoint) =>
  (rig.depth.get(b.id) ?? 0) - (rig.depth.get(a.id) ?? 0);

export function deepestBelow(rig: Rig, base: string | undefined): RobotJoint | undefined {
  if (!base) return undefined;

  return rig.joints.filter((j) => isMovable(j) && rig.chain.get(j.id)?.has(base)).sort(deeperFirst(rig))[0];
}

const deepestId = (rig: Rig, ids: string[]) =>
  [...ids].sort((a, b) => (rig.depth.get(b) ?? 0) - (rig.depth.get(a) ?? 0))[0];

const movableNamed = (rig: Rig, re: RegExp) =>
  rig.joints.filter((j) => isMovable(j) && re.test(j.name.toLowerCase())).map((j) => j.id);

function toeLandmark(robot: RobotRef, last: RobotJoint, from: THREE.Vector3 | undefined): THREE.Vector3 | null {
  const sole = robot.pointOf(last.id, 'bottom');
  const ids = linkParts(robot.rig, last.id);

  if (!sole || !ids.length) return null;

  const c = robot.pointOf(last.id, 'center')!;
  const len = Math.max(30, Math.abs(c[2] - (from?.z ?? c[2])) * 2 + 40);

  return new THREE.Vector3(sole[0], sole[1], sole[2] + len * 0.5);
}

function centerLandmark(robot: RobotRef, last: RobotJoint): THREE.Vector3 | null {
  const c = robot.pointOf(last.id, 'center');

  return c ? new THREE.Vector3(...c) : null;
}

function addLimbEnd(robot: RobotRef, rp: Landmarks, [side, kind, from]: LimbEnd) {
  const key = `${side}${kind}` as Keypoint;

  if (rp.has(key) && kind !== 'Toe') return;

  const last = deepestBelow(robot.rig, robot.joints[from]);

  if (!last) return;

  const p = kind === 'Toe' ? toeLandmark(robot, last, rp.get(from)) : centerLandmark(robot, last);

  if (p) rp.set(key, p);
}

const midpoint = (rp: Landmarks, a: Keypoint, b: Keypoint) =>
  rp.has(a) && rp.has(b) ? rp.get(a)!.clone().add(rp.get(b)!).multiplyScalar(0.5) : null;

function setHeadLandmark(robot: RobotRef, rp: Landmarks, neckJoints: string[]) {
  if (!neckJoints.length) {
    rp.delete('neck');
    rp.delete('head');

    return;
  }

  const c = robot.pointOf(deepestId(robot.rig, neckJoints), 'center');

  if (c) rp.set('head', new THREE.Vector3(...c));
}

export function robotLandmarks(robot: RobotRef): RobotLandmarks {
  const { rig, joints } = robot;
  const rp: Landmarks = new Map();

  for (const k of KEYPOINTS) {
    const id = joints[k];
    const j = id ? rig.byId.get(id) : undefined;

    if (j) rp.set(k, new THREE.Vector3(...j.origin));
  }

  for (const end of LIMB_ENDS) addLimbEnd(robot, rp, end);

  rp.set('hips', midpoint(rp, 'leftHip', 'rightHip') ?? new THREE.Vector3(...rig.rootPivot));

  const chest = midpoint(rp, 'leftShoulder', 'rightShoulder');

  if (chest) rp.set('chest', chest);

  const torsoJoints = movableNamed(rig, /waist|torso|spine|trunk|chest/);
  const neckJoints = movableNamed(rig, /neck|head/);

  setHeadLandmark(robot, rp, neckJoints);

  return { ...robot, rp, torsoJoints, neckJoints };
}

function carrierJointId(robot: RobotLandmarks, k: Keypoint): string | undefined {
  const { rig, joints } = robot;

  if (k === 'chest') return robot.torsoJoints.length ? deepestId(rig, robot.torsoJoints) : undefined;

  if (k === 'head' || k === 'neck') return robot.neckJoints.length ? deepestId(rig, robot.neckJoints) : undefined;

  if (k === 'hips') return undefined;

  if (/Toe/.test(k)) return deepestBelow(rig, joints[k.replace('Toe', 'Ankle') as Keypoint])?.id;

  if (/Wrist/.test(k) && !joints[k]) return deepestBelow(rig, joints[k.replace('Wrist', 'Elbow') as Keypoint])?.id;

  const jointId = joints[k];

  return jointId ? (rig.parentOf.get(jointId) ?? undefined) : undefined;
}

export function carrierOf(robot: RobotLandmarks, k: Keypoint): Carrier | null {
  const p = robot.rp.get(k);

  if (!p) return null;

  const jointId = carrierJointId(robot, k);
  const partId = jointId ? linkParts(robot.rig, jointId)[0] : undefined;

  return partId ? { partId, point: [p.x, p.y, p.z] } : null;
}

export function segmentLength(robot: RobotLandmarks, a: Keypoint, b: Keypoint): number {
  const { rp } = robot;

  return rp.has(a) && rp.has(b) ? rp.get(a)!.distanceTo(rp.get(b)!) : 0;
}

export function soleRefs(robot: RobotRef): Array<{ part: string; p: V3 }> {
  return (['leftAnkle', 'rightAnkle'] as Keypoint[])
    .map((k) => {
      const last = deepestBelow(robot.rig, robot.joints[k]);
      const p = last ? robot.pointOf(last.id, 'bottom') : null;
      const part = last ? linkParts(robot.rig, last.id)[0] : undefined;

      return p && part ? { part, p } : null;
    })
    .filter((x): x is { part: string; p: V3 } => !!x);
}
