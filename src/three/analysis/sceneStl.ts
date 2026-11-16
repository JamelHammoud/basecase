import * as THREE from 'three';
import { StlWriter } from '../../utils/stlBytes';
import type { ShapeSolid } from './shapeSolid';

const Z_UP = new THREE.Matrix4().makeRotationX(Math.PI / 2);

export function sceneStl(
  instances: Array<{ key: string; matrix: number[] }>,
  solidOf: (key: string) => ShapeSolid,
): Uint8Array {
  const solids = instances.map((instance) => solidOf(instance.key).positions);
  const writer = new StlWriter(Math.floor(solids.reduce((n, positions) => n + positions.length, 0) / 9));
  const matrix = new THREE.Matrix4();
  const v = new THREE.Vector3();

  instances.forEach((instance, k) => {
    matrix.fromArray(instance.matrix).premultiply(Z_UP);

    for (let i = 0; i + 8 < solids[k].length; i += 9) {
      for (let corner = 0; corner < 9; corner += 3)
        v.fromArray(solids[k], i + corner)
          .applyMatrix4(matrix)
          .toArray(writer.triangle, corner);

      writer.facet();
    }
  });

  return writer.bytes;
}
