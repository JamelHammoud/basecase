import * as THREE from 'three';
import type { ScenePart } from '../types/robotics';

export type V3 = [number, number, number];

export const r1 = (v: number) => Math.round(v * 10) / 10;
export const r2 = (v: number) => Math.round(v * 100) / 100;
export const r3 = (v: number) => Math.round(v * 1000) / 1000;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'group';

export const toScene = ([x, y, z]: V3): V3 => [x, z, -y];
export const toCad = ([x, y, z]: V3): V3 => [x, -z, y];

const M = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 1, 0),
);
const Mi = M.clone().invert();
const DEG = Math.PI / 180;

export function eulerToMatrix(deg: V3): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(deg[0] * DEG, deg[1] * DEG, deg[2] * DEG, 'XYZ'));
}

export function matrixToEuler(m: THREE.Matrix4): V3 {
  const e = new THREE.Euler().setFromRotationMatrix(m, 'XYZ');
  const d = (v: number) => {
    const x = Math.round((v / DEG) * 10) / 10;

    return Object.is(x, -0) ? 0 : x;
  };

  return [d(e.x), d(e.y), d(e.z)];
}

export const rotToScene = (deg: V3): V3 => matrixToEuler(M.clone().multiply(eulerToMatrix(deg)).multiply(Mi));
export const rotToCad = (deg: V3): V3 => matrixToEuler(Mi.clone().multiply(eulerToMatrix(deg)).multiply(M));

export function rotate(v: V3, sceneDeg: V3): V3 {
  const out = new THREE.Vector3(...v).applyMatrix4(eulerToMatrix(sceneDeg));

  return [out.x, out.y, out.z];
}

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const MIRROR_AXIS_INDEX: Record<'x' | 'y' | 'z', 0 | 1 | 2> = { x: 0, y: 2, z: 1 };

export function groupFor(name?: string): ScenePart['group'] {
  return name ? { id: `agent-${slug(name)}`, name } : undefined;
}
