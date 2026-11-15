import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { measureObject, measureTriangles } from './meshMeasure';

describe('measureObject', () => {
  it('measures a moved box exactly', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 30));

    mesh.position.set(5, 10, -15);

    const m = measureObject(mesh);

    expect(m.volumeMm3).toBeCloseTo(6000);
    expect(m.areaMm2).toBeCloseTo(2 * (200 + 600 + 300));
    expect(m.min).toEqual([0, 0, -30]);
    expect(m.max).toEqual([10, 20, 0]);
    m.centroid.forEach((v, i) => expect(v).toBeCloseTo([5, 10, -15][i]));
    expect(m.triangles).toBe(12);
  });
});

describe('measureTriangles', () => {
  it.each([false, true])('measures a translated tetrahedron with reversed winding %s', (reversed) => {
    const vertices = [
      [0, 0, 0],
      [2, 0, 0],
      [0, 3, 0],
      [0, 0, 4],
    ];
    const faces = [
      [0, 2, 1],
      [0, 1, 3],
      [0, 3, 2],
      [1, 2, 3],
    ];
    const offset = [10, -20, 30];
    const positions = new Float32Array(
      faces.flatMap((face) =>
        (reversed ? face.toReversed() : face).flatMap((index) =>
          vertices[index].map((value, axis) => value + offset[axis]),
        ),
      ),
    );
    const original = positions.slice();
    const measure = measureTriangles(positions);

    expect(measure.volumeMm3).toBeCloseTo(4);
    expect(measure.areaMm2).toBeCloseTo(13 + Math.sqrt(61));
    expect(measure.min).toEqual(offset);
    expect(measure.max).toEqual([12, -17, 34]);
    expect(measure.triangles).toBe(4);
    measure.centroid.forEach((value, axis) => expect(value).toBeCloseTo([10.5, -19.25, 31][axis]));
    expect(positions).toEqual(original);
  });

  it('keeps bounds and their midpoint for planar and degenerate triangles', () => {
    const measure = measureTriangles(new Float32Array([-2, 0, -3, 6, 0, -3, -2, 0, 9, 4, 0, 5, 4, 0, 5, 4, 0, 5]));

    expect(measure).toEqual({
      volumeMm3: 0,
      areaMm2: 48,
      min: [-2, 0, -3],
      max: [6, 0, 9],
      centroid: [2, 0, 3],
      triangles: 2,
    });
  });

  it('keeps the empty measurement', () => {
    expect(measureTriangles(new Float32Array())).toEqual({
      volumeMm3: 0,
      areaMm2: 0,
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
      centroid: [NaN, NaN, NaN],
      triangles: 0,
    });
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('keeps bounds when a final triangle has only %i coordinates', (remaining) => {
    const positions = Float32Array.from({ length: 18 + remaining }, (_, index) => index - 11);
    const measure = measureTriangles(positions);
    const bounds = new THREE.Box3();

    for (let axis = 0; axis < 3; axis++) {
      const values = Array.from(positions).filter((_, index) => index % 3 === axis);

      bounds.min.setComponent(axis, Math.min(...values));
      bounds.max.setComponent(axis, Math.max(...values));
    }

    expect(measure.volumeMm3).toBeNaN();
    expect(measure.areaMm2).toBeNaN();
    expect(measure.min).toEqual(bounds.min.toArray());
    expect(measure.max).toEqual(bounds.max.toArray());
    expect(measure.centroid).toEqual(bounds.getCenter(new THREE.Vector3()).toArray());
    expect(measure.triangles).toBe(positions.length / 9);
  });

  it.each([300, 600])('reads each coordinate once for %i triangles', (triangles) => {
    const positions = Float32Array.from({ length: triangles * 9 }, (_, index) => (index % 29) - 14);
    const expected = measureTriangles(positions);
    let reads = 0;
    const counted = new Proxy(positions, {
      get(target, key) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        return Reflect.get(target, key, target);
      },
    });

    expect(measureTriangles(counted)).toEqual(expected);
    expect(reads).toBe(positions.length);
  });
});
