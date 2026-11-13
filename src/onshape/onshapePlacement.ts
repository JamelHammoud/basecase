import * as THREE from 'three';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { partMatrix } from '../utils/kinematics';

type Vec3 = [number, number, number];

export interface Pair {
  old: ScenePart;
  fresh: ScenePart;
}

const close = (a: readonly number[], b: readonly number[], tolerance: number) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tolerance);

const sizeOf = (p: ScenePart): Vec3 => [p.dimensions.width, p.dimensions.height, p.dimensions.depth];

export function sameShape(a: ScenePart, b: ScenePart): boolean {
  if (!close(sizeOf(a), sizeOf(b), 0.01)) return false;

  if (!a.mesh || !b.mesh) return !a.mesh && !b.mesh;

  return a.mesh.indices.length === b.mesh.indices.length && close(a.mesh.positions, b.mesh.positions, 1e-4);
}

export const samePlace = (a: ScenePart, b: ScenePart) =>
  close(a.position, b.position, 0.01) && close(a.rotation, b.rotation, 0.01);

export const sameJointPlace = (a: RobotJoint, b: RobotJoint) =>
  close(a.origin, b.origin, 0.01) && close(a.axis, b.axis, 1e-4);

function centerOf(parts: ScenePart[]): THREE.Vector3 {
  const sum = parts.reduce((s, p) => s.add(new THREE.Vector3(...p.position)), new THREE.Vector3());

  return parts.length ? sum.divideScalar(parts.length) : sum;
}

export function placementOf(pairs: Pair[], old: ScenePart[], fresh: ScenePart[]): THREE.Matrix4 {
  const anchor = pairs.find((p) => sameShape(p.old, p.fresh)) ?? pairs[0];

  if (anchor) return partMatrix(anchor.old).multiply(partMatrix(anchor.fresh).invert());

  const shift = centerOf(old).sub(centerOf(fresh));

  return new THREE.Matrix4().makeTranslation(shift.x, shift.y, shift.z);
}

const rounded = (v: number, places = 1000) => Math.round(v * places) / places + 0;

export function placedPart(p: ScenePart, placement: THREE.Matrix4): Pick<ScenePart, 'position' | 'rotation'> {
  const at = new THREE.Vector3();
  const turn = new THREE.Quaternion();

  placement.clone().multiply(partMatrix(p)).decompose(at, turn, new THREE.Vector3());

  const euler = new THREE.Euler().setFromQuaternion(turn, 'XYZ');

  return {
    position: [rounded(at.x), rounded(at.y), rounded(at.z)],
    rotation: [euler.x, euler.y, euler.z].map((r) => rounded(THREE.MathUtils.radToDeg(r))) as Vec3,
  };
}

export function placedJoint(j: RobotJoint, placement: THREE.Matrix4): Pick<RobotJoint, 'origin' | 'axis'> {
  const origin = new THREE.Vector3(...j.origin).applyMatrix4(placement);
  const axis = new THREE.Vector3(...j.axis).transformDirection(placement);

  return {
    origin: [rounded(origin.x), rounded(origin.y), rounded(origin.z)],
    axis: [axis.x, axis.y, axis.z].map((v) => rounded(v, 1e6)) as Vec3,
  };
}
