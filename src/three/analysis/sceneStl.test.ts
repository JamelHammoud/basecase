import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { posedStl } from '../../print/posedStl';
import { binaryStl } from '../../utils/stlBytes';
import { sceneStl } from './sceneStl';
import { ShapeSolid } from './shapeSolid';

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, i) => value === b[i]);

const zUp = new THREE.Matrix4().makeRotationX(Math.PI / 2);

function previousScene(instances: Array<{ key: string; matrix: number[] }>, solids: Map<string, ShapeSolid>) {
  const positions = instances.map((instance) => solids.get(instance.key)!.positions);
  const out = new Float32Array(positions.reduce((n, p) => n + p.length, 0));
  const vector = new THREE.Vector3();
  let offset = 0;

  instances.forEach((instance, index) => {
    const matrix = new THREE.Matrix4().fromArray(instance.matrix).premultiply(zUp);

    for (let i = 0; i < positions[index].length; i += 3, offset += 3)
      vector.fromArray(positions[index], i).applyMatrix4(matrix).toArray(out, offset);
  });

  return binaryStl(out);
}

function previousPose(positions: ArrayLike<number>, m: number[]) {
  const out = new Float32Array(positions.length);

  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];

    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }

  return binaryStl(out);
}

function matrixFor(seed: number) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(seed / 7, -seed / 3, seed / 11),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(seed / 5, seed / 13, seed / 17)),
    new THREE.Vector3(seed % 2 ? -1.7 : 0, 2.3, 0.7),
  );

  matrix.elements[3] = seed / 10000;

  return matrix.toArray();
}

describe('streamed STL transforms', () => {
  it('matches complete files for posed parts and repeated scene instances without changing sources', () => {
    for (let seed = 0; seed < 80; seed++) {
      const storage = Float32Array.from({ length: 9 * (seed + 1) + 4 }, (_, i) => Math.sin(i + seed) * 123.45);
      const positions = storage.subarray(2, storage.length - 2);
      const source = storage.slice();
      const solids = new Map([['part', new ShapeSolid(positions)]]);
      const instances = [seed, seed + 1, seed + 2].map((n) => ({ key: 'part', matrix: matrixFor(n) }));
      const matrices = instances.map((instance) => [...instance.matrix]);
      const actual = sceneStl(instances, (key) => solids.get(key)!);

      expect(sameBytes(actual, previousScene(instances, solids))).toBe(true);
      expect(sameBytes(posedStl(positions, instances[0].matrix), previousPose(positions, instances[0].matrix))).toBe(
        true,
      );
      expect(storage).toEqual(source);
      expect(instances.map((instance) => instance.matrix)).toEqual(matrices);

      positions[0] += 1;
      instances[0].matrix[12] += 10;

      expect(
        sameBytes(
          sceneStl(instances, (key) => solids.get(key)!),
          previousScene(instances, solids),
        ),
      ).toBe(true);
      expect(
        sameBytes(
          actual,
          sceneStl(instances, (key) => solids.get(key)!),
        ),
      ).toBe(false);
    }
  });

  it('keeps empty, degenerate, nonfinite and incomplete posed inputs compatible', () => {
    const matrix = new THREE.Matrix4().identity().toArray();
    const inputs = [[], [0], [1, 2, 3], Array(18).fill(0), [NaN, Infinity, -Infinity, 1, 2, 3, 4, 5, 6]];

    for (const input of inputs) expect(posedStl(input, matrix)).toEqual(previousPose(input, matrix));

    expect(sceneStl([], () => new ShapeSolid(new Float32Array()))).toEqual(binaryStl([]));

    const solid = new ShapeSolid(new Float32Array(18));
    const instances = [{ key: 'degenerate', matrix }];
    const solids = new Map([['degenerate', solid]]);

    expect(sceneStl(instances, () => solid)).toEqual(previousScene(instances, solids));
  });
});
