import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { tessellateGeometryForSculpting } from './sculptEngine';

function bufferedTessellation(geometry: THREE.BufferGeometry, passes: number) {
  let current = geometry.index ? geometry.toNonIndexed() : geometry.clone();

  for (let pass = 0; pass < passes; pass++) {
    const position = current.getAttribute('position');
    const count = position.count / 3;

    if (count > 8000) break;

    const coordinates: number[] = [];

    for (let triangle = 0; triangle < count; triangle++) {
      const a = new THREE.Vector3().fromBufferAttribute(position, triangle * 3);
      const b = new THREE.Vector3().fromBufferAttribute(position, triangle * 3 + 1);
      const c = new THREE.Vector3().fromBufferAttribute(position, triangle * 3 + 2);
      const ab = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      const bc = new THREE.Vector3().addVectors(b, c).multiplyScalar(0.5);
      const ca = new THREE.Vector3().addVectors(c, a).multiplyScalar(0.5);

      for (const vertex of [a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca]) {
        coordinates.push(vertex.x, vertex.y, vertex.z);
      }
    }

    current = new THREE.BufferGeometry();
    current.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
  }

  return current;
}

function expectCoordinates(actual: ArrayLike<number>, expected: ArrayLike<number>) {
  expect(actual.constructor).toBe(expected.constructor);
  expect(actual).toHaveLength(expected.length);

  for (let index = 0; index < actual.length; index++) {
    if (Object.is(actual[index], expected[index])) continue;

    expect(actual[index], `coordinate ${index}`).toBe(expected[index]);
  }
}

function expectParity(geometry: THREE.BufferGeometry, passes: number) {
  const original = geometry.clone();
  const actual = tessellateGeometryForSculpting(geometry, passes);
  const expected = bufferedTessellation(geometry, passes);

  expectCoordinates(actual.getAttribute('position').array, expected.getAttribute('position').array);
  expect(actual.index).toEqual(expected.index);
  expect(Object.keys(actual.attributes)).toEqual(Object.keys(expected.attributes));
  expectCoordinates(geometry.getAttribute('position').array, original.getAttribute('position').array);
  expect(geometry.index).toEqual(original.index);
  expect(actual.getAttribute('position').array).not.toBe(geometry.getAttribute('position').array);

  return actual;
}

function triangleSoup(count: number) {
  const coordinates = Float64Array.from({ length: count * 9 }, (_, index) => Math.sin(index * 0.37) * 300);
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.BufferAttribute(coordinates, 3));

  return geometry;
}

describe('Sculpt tessellation', () => {
  it('matches buffered subdivision across indexed shapes, passes and later edits', () => {
    const geometries = [
      new THREE.BoxGeometry(20, 30, 10),
      new THREE.SphereGeometry(11, 9, 6),
      new THREE.CylinderGeometry(3, 9, 25, 7, 2),
      triangleSoup(37),
    ];

    for (const geometry of geometries) {
      for (const passes of [-1, 0, 1, 2, 3]) expectParity(geometry, passes);

      const before = expectParity(geometry, 1);
      const retained = before.getAttribute('position').array.slice();

      geometry.getAttribute('position').setXYZ(0, -120.125, 1e-8, 50.25);
      expectParity(geometry, 2);
      expectCoordinates(before.getAttribute('position').array, retained);
    }
  });

  it('keeps degenerate, nonfinite and incomplete triangles in their existing order', () => {
    for (const coordinates of [[], [0, -0, 0], [1, 2, 3, 4, 5, 6], [NaN, Infinity, -Infinity, 0, -0, 0, 0, 0, 0]]) {
      const geometry = new THREE.BufferGeometry();

      geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
      expectParity(geometry, 2);
    }
  });

  it('reads interleaved positions without changing the source buffer', () => {
    const values = Float32Array.from({ length: 60 }, (_, index) => Math.cos(index) * 10);
    const buffer = new THREE.InterleavedBuffer(values, 5);
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 1));
    expectParity(geometry, 2);
  });

  it('retains the inclusive 8000-triangle pass limit', () => {
    for (const count of [300, 600, 8000, 8001]) {
      const actual = expectParity(triangleSoup(count), 2);
      const expectedCount = count > 8000 ? count : count * 4;
      const finalCount = count < 2001 ? expectedCount * 4 : expectedCount;

      expect(actual.getAttribute('position').count).toBe(finalCount * 3);
    }
  });
});
