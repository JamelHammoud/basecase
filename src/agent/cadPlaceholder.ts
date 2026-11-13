import * as THREE from 'three';
import type { AgentCadPayload } from './cadMesh';

export type Box = [THREE.Vector3, THREE.Vector3];

export const box = (min: [number, number, number], max: [number, number, number]): Box => [
  new THREE.Vector3(...min),
  new THREE.Vector3(...max),
];

export function corners([min, max]: Box, m?: THREE.Matrix4): THREE.Vector3[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
    const p = new THREE.Vector3(k & 1 ? max.x : min.x, k & 2 ? max.y : min.y, k & 4 ? max.z : min.z);

    return m ? p.applyMatrix4(m) : p;
  });
}

const BOX_TRIANGLES = [
  0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5,
];

const r2 = (v: number) => {
  const x = Math.round(v * 100) / 100;

  return Object.is(x, -0) ? 0 : x;
};

export function placeholder(code: string, points: THREE.Vector3[]): AgentCadPayload {
  const bounds = new THREE.Box3().setFromPoints(points);
  const hull = corners([bounds.min, bounds.max]);

  return {
    language: 'openscad',
    code,
    positions: hull.flatMap((p) => [r2(p.x), r2(p.y), r2(p.z)]),
    indices: BOX_TRIANGLES,
  };
}
