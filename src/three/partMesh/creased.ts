import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PartDimensions } from '../../types/robotics';
import { objectKey } from './sharedGeometry';

export interface MeshSource {
  positions: number[];
  indices: number[];
  baseSize: [number, number, number];
}

export const MESH_CREASE_DEG = 30;

export const CAD_CREASE_DEG = 32;

export const meshScale = (size: Pick<PartDimensions, 'width' | 'height' | 'depth'>, base: [number, number, number]) =>
  [size.width / base[0], size.height / base[1], size.depth / base[2]].map((v) => (Number.isFinite(v) && v > 0 ? v : 1));

export const creaseKey = (src: MeshSource, creaseDeg: number, scale: number[]) =>
  `${objectKey(src)}|crease${creaseDeg}|${scale.join(',')}`;

export function creasedGeometry(
  src: { positions: ArrayLike<number>; indices: ArrayLike<number> },
  creaseDeg: number,
  scale: number[],
): THREE.BufferGeometry {
  let geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(src.positions as number[], 3));
  geometry.setIndex(
    Array.isArray(src.indices) ? src.indices : new THREE.BufferAttribute(src.indices as Uint32Array, 1),
  );
  geometry = toCreasedNormals(geometry, THREE.MathUtils.degToRad(creaseDeg));
  geometry.scale(scale[0], scale[1], scale[2]);

  return geometry;
}

export function geometryFromArrays(position: Float32Array, normal: Float32Array): THREE.BufferGeometry {
  return new THREE.BufferGeometry()
    .setAttribute('position', new THREE.BufferAttribute(position, 3))
    .setAttribute('normal', new THREE.BufferAttribute(normal, 3));
}
