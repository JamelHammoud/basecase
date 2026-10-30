import * as THREE from 'three';
import type { Placed } from '../three/analysis/collide';

const RAY_DIRS = [
  new THREE.Vector3(1, 0.013, 0.007),
  new THREE.Vector3(-0.01, 1, 0.02),
  new THREE.Vector3(0.017, -0.006, 1),
].map((v) => v.normalize());

const local = new THREE.Vector3();
const ray = new THREE.Ray();
const hit = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };

export function insideSolid(p: Placed, world: THREE.Vector3): boolean {
  if (!p.box.containsPoint(world)) return false;

  local.copy(world).applyMatrix4(p.inverse);

  if (!p.solid.box.containsPoint(local)) return false;

  let votes = 0;

  for (const dir of RAY_DIRS) {
    ray.set(local, dir);

    if (p.solid.bvh.raycast(ray, THREE.DoubleSide).filter((h) => h.distance > 1e-4).length % 2 === 1) votes++;
  }

  return votes >= 2;
}

export function distanceTo(p: Placed, world: THREE.Vector3, max: number): number {
  if (p.box.distanceToPoint(world) > max) return Infinity;

  local.copy(world).applyMatrix4(p.inverse);

  const found = p.solid.bvh.closestPointToPoint(local, hit as never, 0, max);

  return found ? found.distance : Infinity;
}

export const isNear = (p: Placed, world: THREE.Vector3, gap: number) =>
  distanceTo(p, world, gap) <= gap || insideSolid(p, world);

export function perpendicularBasis(axis: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const a = new THREE.Vector3(1, 0, 0).cross(axis);

  if (a.length() < 0.1) a.set(0, 0, 1).cross(axis);

  a.normalize();

  return [a, axis.clone().cross(a).normalize()];
}

export function ringAround(centre: THREE.Vector3, axis: THREE.Vector3, radius: number, n = 8): THREE.Vector3[] {
  const [u, w] = perpendicularBasis(axis);

  return Array.from({ length: n }, (_, i) => {
    const a = (i * 2 * Math.PI) / n;

    return centre
      .clone()
      .addScaledVector(u, Math.cos(a) * radius)
      .addScaledVector(w, Math.sin(a) * radius);
  });
}

export interface Frame {
  origin: THREE.Vector3;
  axis: THREE.Vector3;
  at: (y: number) => THREE.Vector3;
}

export function frameOf(p: Placed): Frame {
  const origin = new THREE.Vector3().setFromMatrixPosition(p.matrix);
  const axis = new THREE.Vector3().setFromMatrixColumn(p.matrix, 1).normalize();

  return { origin, axis, at: (y) => origin.clone().addScaledVector(axis, y) };
}
