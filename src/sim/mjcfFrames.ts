import * as THREE from 'three';
import type { V3 } from '../utils/kinematics';
import type { SimModel } from './mjcfTypes';

export const toMj = (v: V3 | THREE.Vector3): V3 => {
  const [x, y, z] = Array.isArray(v) ? v : [v.x, v.y, v.z];

  return [x / 1000, -z / 1000, y / 1000];
};
export const fromMj = (x: number, y: number, z: number): V3 => [x * 1000, z * 1000, -y * 1000];
export function quatFromMj(wxyz: ArrayLike<number>, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.set(wxyz[1], wxyz[3], -wxyz[2], wxyz[0]);
}
export const quatToMj = (q: THREE.Quaternion): [number, number, number, number] => [q.w, q.x, -q.z, q.y];

export function simDeltas(model: SimModel, poses: Float64Array): Map<string, THREE.Matrix4> {
  const out = new Map<string, THREE.Matrix4>();
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();

  model.bodies.forEach((b, i) => {
    if (!b.parts.length) return;

    const o = i * 7;
    const p = fromMj(poses[o], poses[o + 1], poses[o + 2]);

    quatFromMj(poses.subarray(o + 3, o + 7), q);
    m.makeRotationFromQuaternion(q);

    const r = new THREE.Vector3(...b.origin).applyQuaternion(q);

    m.setPosition(p[0] - r.x, p[1] - r.y, p[2] - r.z);

    for (const id of b.parts) out.set(id, m.clone());
  });

  return out;
}
