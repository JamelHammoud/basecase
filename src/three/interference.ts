import * as THREE from 'three';
import { worldTriangles } from './meshMeasure';

export { pairKey } from '../../electron/cad-kernel/pairKey.mjs';

export const DEEPER_THAN_REST_MM = 2;

export interface Interference {
  a: string;
  b: string;
  depthMm: number;
  fraction: number;
}

export interface Coplanar {
  a: string;
  b: string;
  areaMm2: number;
}

export function worldGeometry(object: THREE.Object3D): THREE.BufferGeometry | null {
  const all = worldTriangles(object);

  if (all.length < 9) return null;

  const geom = new THREE.BufferGeometry();

  geom.setAttribute('position', new THREE.BufferAttribute(all, 3));

  return geom;
}
