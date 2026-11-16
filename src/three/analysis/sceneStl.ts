import * as THREE from 'three';
import { StlWriter } from '../../utils/stlBytes';
import type { ShapeSolid } from './shapeSolid';

const Z_UP = new THREE.Matrix4().makeRotationX(Math.PI / 2);

type StlInstance = { key: string; matrix: number[] };

export function sceneStl(instances: StlInstance[], solidOf: (key: string) => ShapeSolid): Uint8Array {
  const solids = instances.map((instance) => solidOf(instance.key).positions);
  const count = Math.floor(solids.reduce((n, positions) => n + positions.length, 0) / 9);
  const writer = new StlWriter(count);

  if (solids.some((positions) => positions.length % 9 !== 0)) {
    writePartialMeshes(instances, solids, writer, count);

    return writer.bytes;
  }

  const matrix = new THREE.Matrix4();
  const v = new THREE.Vector3();

  instances.forEach((instance, k) => {
    matrix.fromArray(instance.matrix).premultiply(Z_UP);

    for (let i = 0; i < solids[k].length; i += 9) {
      for (let corner = 0; corner < 9; corner += 3)
        v.fromArray(solids[k], i + corner)
          .applyMatrix4(matrix)
          .toArray(writer.triangle, corner);

      writer.facet();
    }
  });

  return writer.bytes;
}

function writePartialMeshes(instances: StlInstance[], solids: Float32Array[], writer: StlWriter, count: number) {
  const matrix = new THREE.Matrix4();
  const v = new THREE.Vector3();
  let remainingFacets = count;
  let corner = 0;

  for (let k = 0; k < instances.length; k++) {
    matrix.fromArray(instances[k].matrix).premultiply(Z_UP);

    for (let i = 0; i < solids[k].length && remainingFacets > 0;) {
      for (; corner < 9 && i < solids[k].length; corner += 3, i += 3)
        v.fromArray(solids[k], i).applyMatrix4(matrix).toArray(writer.triangle, corner);

      if (corner < 9) continue;

      writer.facet();
      corner = 0;
      remainingFacets--;
    }
  }
}
