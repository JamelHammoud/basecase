import * as THREE from 'three';
import type { RobotJoint, RobotPoseState, RootOffset, ScenePart } from '../types/robotics';
import { isMovable, type Rig, type V3 } from './kinematicsRig';

export function partMatrix(p: ScenePart): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...(p.rotation.map(THREE.MathUtils.degToRad) as V3), 'XYZ'),
  );

  return new THREE.Matrix4().compose(new THREE.Vector3(...p.position), q, new THREE.Vector3(1, 1, 1));
}

export function clampJoint(j: RobotJoint, v: number): number {
  if (!Number.isFinite(v)) return 0;

  if (!j.range) return v;

  return Math.min(Math.max(v, Math.min(j.range[0], j.range[1])), Math.max(j.range[0], j.range[1]));
}

export const isZeroRoot = (r?: RootOffset) =>
  !r || [...(r.position ?? []), ...(r.rotation ?? [])].every((v) => Math.abs(v) < 1e-6);

export const robotRootOffset = (rig: Rig, pose: RobotPoseState | null | undefined, key: string) =>
  pose?.roots?.[key] ?? (rig.robots.length === 1 ? pose?.root : undefined);

const _v = new THREE.Vector3();
const _o = new THREE.Vector3();
const _q = new THREE.Quaternion();

export function jointMotion(j: RobotJoint, value: number, out = new THREE.Matrix4()): THREE.Matrix4 {
  if (!isMovable(j) || !value) return out.identity();

  _v.set(j.axis[0], j.axis[1], j.axis[2]).normalize();

  if (j.type === 'prismatic') return out.makeTranslation(_v.x * value, _v.y * value, _v.z * value);

  _o.set(j.origin[0], j.origin[1], j.origin[2]);
  _q.setFromAxisAngle(_v, THREE.MathUtils.degToRad(value));
  out.makeRotationFromQuaternion(_q);

  const r = _o.clone().applyQuaternion(_q);

  out.setPosition(_o.x - r.x, _o.y - r.y, _o.z - r.z);

  return out;
}

export function rootMatrix(pivot: V3, root?: RootOffset): THREE.Matrix4 {
  const m = new THREE.Matrix4();

  if (!root) return m;

  const [px, py, pz] = pivot;
  const r = root.rotation ?? [0, 0, 0];

  if (r[0] || r[1] || r[2]) {
    const rot = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(...(r.map(THREE.MathUtils.degToRad) as V3), 'XYZ'),
    );

    m.makeTranslation(px, py, pz)
      .multiply(rot)
      .multiply(new THREE.Matrix4().makeTranslation(-px, -py, -pz));
  }

  const t = root.position ?? [0, 0, 0];

  if (t[0] || t[1] || t[2]) m.premultiply(new THREE.Matrix4().makeTranslation(t[0], t[1], t[2]));

  return m;
}

export interface PosedRig {
  joint: Map<string, THREE.Matrix4>;
  root: THREE.Matrix4;
  roots: Map<string, THREE.Matrix4>;
}

function jointBase(rig: Rig, posed: PosedRig, j: RobotJoint): THREE.Matrix4 {
  const parent = rig.parentOf.get(j.id);

  return (parent && posed.joint.get(parent)) || posed.roots.get(rig.robotOf.get(j.id) ?? '') || posed.root;
}

export function forwardKinematics(rig: Rig, pose: RobotPoseState | null | undefined): PosedRig {
  const roots = new Map<string, THREE.Matrix4>();

  for (const r of rig.robots) roots.set(r.key, rootMatrix(r.pivot, robotRootOffset(rig, pose, r.key)));

  const root = (rig.robots[0] && roots.get(rig.robots[0].key)) || new THREE.Matrix4();
  const posed: PosedRig = { joint: new Map(), root, roots };
  const tmp = new THREE.Matrix4();

  for (const j of rig.joints) {
    const v = clampJoint(j, pose?.values[j.id] ?? 0);

    posed.joint.set(
      j.id,
      jointBase(rig, posed, j)
        .clone()
        .multiply(jointMotion(j, v, tmp)),
    );
  }

  return posed;
}

export function partMotion(rig: Rig, posed: PosedRig, partId: string): THREE.Matrix4 | null {
  const owner = rig.ownerOf.get(partId);

  if (owner) return posed.joint.get(owner) ?? null;

  const key = rig.robotOf.get(partId);

  return key ? (posed.roots.get(key) ?? null) : null;
}

export function isRestPose(pose: RobotPoseState | null | undefined): boolean {
  if (!pose) return true;

  if (!isZeroRoot(pose.root) || Object.values(pose.roots ?? {}).some((r) => !isZeroRoot(r))) return false;

  return Object.values(pose.values).every((v) => Math.abs(v) < 1e-6);
}

function isIdentity(m: THREE.Matrix4) {
  const e = m.elements;
  const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  return e.every((v, i) => Math.abs(v - id[i]) < 1e-9);
}

export function poseDeltas(
  rig: Rig,
  pose: RobotPoseState | null | undefined,
  partIds: string[],
): Map<string, THREE.Matrix4> {
  const out = new Map<string, THREE.Matrix4>();

  if (!pose || (isRestPose(pose) && !rig.joints.length)) return out;

  const posed = forwardKinematics(rig, pose);

  for (const id of partIds) {
    const m = partMotion(rig, posed, id);

    if (m && !isIdentity(m)) out.set(id, m);
  }

  return out;
}

export function posedAxis(rig: Rig, posed: PosedRig, j: RobotJoint): { origin: THREE.Vector3; axis: THREE.Vector3 } {
  const base = jointBase(rig, posed, j);
  const origin = new THREE.Vector3(...j.origin).applyMatrix4(base);
  const axis = new THREE.Vector3(...j.axis).transformDirection(base);

  return { origin, axis };
}
