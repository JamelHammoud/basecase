import * as THREE from 'three';
import type { Vec3 } from './parts';

export const quaternionOf = (rotation: readonly number[]) =>
  new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...(rotation.map((d) => THREE.MathUtils.degToRad(d)) as Vec3), 'XYZ'),
  );
