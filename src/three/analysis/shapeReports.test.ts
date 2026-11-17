import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { convexHull } from '../../utils/convexHull';
import { measureTriangles } from '../meshMeasure';
import { worldMeasure } from './shapeReports';
import { ShapeSolid } from './shapeSolid';

function previousPlacement(pos: Float32Array, matrix: THREE.Matrix4) {
  const e = matrix.elements;
  const axis = (i: number, a: number) => e[a] * pos[i] + e[4 + a] * pos[i + 1] + e[8 + a] * pos[i + 2] + e[12 + a];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const points: Array<[number, number]> = [];

  for (let i = 0; i < pos.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const value = axis(i, a);

      min[a] = Math.min(min[a], value);
      max[a] = Math.max(max[a], value);
    }
  }

  for (let i = 0; i < pos.length; i += 3) {
    if (axis(i, 1) > min[1] + 1) continue;

    points.push([axis(i, 0), axis(i, 2)]);
  }

  const centroid = new THREE.Vector3(...measureTriangles(pos).centroid).applyMatrix4(matrix).toArray();

  return { min, max, centroid, base: pos.length ? convexHull(points) : undefined };
}

describe('world mesh measurement', () => {
  it('preserves exact placement measurements through transforms and edits', () => {
    const geometry = new THREE.BoxGeometry(4, 2, 6).toNonIndexed();
    const inputs = [
      new Float32Array(),
      geometry.getAttribute('position').array as Float32Array,
      new Float32Array([0, 0, 0, 2, 1, 0, 0, 1.000001, 3]),
      new Float32Array([-0, 0, -0, 0, 0, 0, 0, 0, 0]),
      new Float32Array([1, 2, 3, 4]),
    ];
    const transforms = [
      new THREE.Matrix4(),
      new THREE.Matrix4().makeTranslation(4, -7, 10),
      new THREE.Matrix4().compose(
        new THREE.Vector3(12, -4, 6),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, -0.4, 1.2)),
        new THREE.Vector3(-2, 0.3, 5),
      ),
      new THREE.Matrix4().makeScale(0, 0, 0),
    ];

    for (const positions of inputs) {
      const solid = new ShapeSolid(positions);
      const before = positions.slice();

      for (const matrix of transforms) {
        const saved = matrix.elements.slice();
        const { min, max, centroid, base } = worldMeasure(solid, matrix);

        expect({ min, max, centroid, base }).toEqual(previousPlacement(positions, matrix));
        expect(matrix.elements).toEqual(saved);
      }

      expect(positions).toEqual(before);
      solid.dispose();
    }

    geometry.dispose();
  });

  it.each([300, 600])('reads each coordinate once per pass for %i vertices', (vertices) => {
    let reads = 0;
    const positions = new Proxy(new Float32Array(vertices * 3), {
      get(target, key) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        if (key === 'every') return target.every.bind(target);

        return Reflect.get(target, key, target);
      },
    });
    const solid = new ShapeSolid(positions);
    const matrix = new THREE.Matrix4();

    worldMeasure(solid, matrix);
    reads = 0;
    worldMeasure(solid, matrix);
    expect(reads).toBe(vertices * 6);
  });
});
