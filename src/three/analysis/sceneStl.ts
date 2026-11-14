import * as THREE from 'three';
import { binaryStl } from '../../utils/stlBytes';
import type { ShapeSolid } from './shapeSolid';

const Z_UP = new THREE.Matrix4().makeRotationX(Math.PI / 2);

export function sceneStl(
  instances: Array<{ key: string; matrix: number[] }>,
  solidOf: (key: string) => ShapeSolid,
): Uint8Array {
  const solids = instances.map((instance) => solidOf(instance.key).positions);
  const out = new Float32Array(solids.reduce((n, positions) => n + positions.length, 0));
  const matrix = new THREE.Matrix4();
  const v = new THREE.Vector3();
  let o = 0;

  instances.forEach((instance, k) => {
    matrix.fromArray(instance.matrix).premultiply(Z_UP);

    for (let i = 0; i < solids[k].length; i += 3, o += 3)
      v.fromArray(solids[k], i).applyMatrix4(matrix).toArray(out, o);
  });

  return binaryStl(out);
}
