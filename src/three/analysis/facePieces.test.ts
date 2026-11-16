import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ShapeSolid } from './shapeSolid';

const triangle = [0, 0, 0, 10, 0, 0, 0, 10, 0];
const rounded = (values: number[]) => new Float32Array(values);

function repeatedTriangles(count: number, side = 10): Float32Array {
  return new Float32Array(Array.from({ length: count }, () => [0, 0, 0, side, 0, 0, 0, side, 0]).flat());
}

describe('face subdivision', () => {
  it('keeps ordered barycentric centers, winding and area weights', () => {
    const positions = rounded([...triangle, ...triangle.slice(6), ...triangle.slice(3, 6), ...triangle.slice(0, 3)]);
    const before = positions.slice();
    const solid = new ShapeSolid(positions);
    const faces = solid.faces;
    const centers = [10 / 6, 20 / 3, 0, 10 / 3, 10 / 3, 0, 20 / 3, 10 / 6, 0, 10 / 6, 10 / 6, 0];

    expect(faces.centers.slice(0, 12)).toEqual(rounded(centers));
    expect(faces.areas).toEqual(rounded(new Array(8).fill(12.5)));
    expect(faces.normals.slice(0, 12)).toEqual(rounded([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]));
    expect(faces.normals.slice(12)).toEqual(rounded([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1]));
    expect(solid.faces).toBe(faces);
    expect(positions).toEqual(before);
  });

  it('discards small and degenerate faces and includes the minimum area', () => {
    const positions = rounded([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 0, ...new Array(9).fill(0)]);
    const faces = new ShapeSolid(positions).faces;

    expect(faces.centers).toEqual(rounded([1 / 3, 1 / 3, 0]));
    expect(faces.normals).toEqual(rounded([0, 0, 1]));
    expect(faces.areas).toEqual(rounded([0.5]));
    expect(new ShapeSolid(new Float32Array()).faces.areas).toHaveLength(0);
  });

  it('caps subdivisions and retains triangle stride weights', () => {
    const large = new ShapeSolid(repeatedTriangles(1, 100));
    const strided = new ShapeSolid(repeatedTriangles(3000, 1));

    expect(large.faces.areas).toHaveLength(144);
    expect(large.faces.areas).toEqual(rounded(new Array(144).fill(5000 / 144)));
    expect(strided.faces.areas).toEqual(rounded(new Array(1500).fill(1)));
    expect(strided.surfaceArea).toBe(1500);
  });

  it('matches triangle area and normal calculations across varied orientations and areas', () => {
    const source = new THREE.SphereGeometry(20, 24, 16);
    const geometry = source.toNonIndexed();
    const positions = new Float32Array(geometry.attributes.position.array);
    const expectedNormals: number[] = [];
    const expectedAreas: number[] = [];
    const tri = new THREE.Triangle();
    const normal = new THREE.Vector3();

    for (let i = 0; i < positions.length; i += 9) {
      tri.a.fromArray(positions, i);
      tri.b.fromArray(positions, i + 3);
      tri.c.fromArray(positions, i + 6);

      const area = tri.getArea();

      if (area < 0.5) continue;

      tri.getNormal(normal);

      const splits = Math.min(12, Math.ceil(Math.sqrt(area / 25)));

      for (let piece = 0; piece < splits * splits; piece++) {
        expectedNormals.push(normal.x, normal.y, normal.z);
        expectedAreas.push(area / (splits * splits));
      }
    }

    const faces = new ShapeSolid(positions).faces;

    expect(faces.normals).toEqual(rounded(expectedNormals));
    expect(faces.areas).toEqual(rounded(expectedAreas));
    geometry.dispose();
    source.dispose();
  });

  it.each([300, 600])('uses one center workspace for %i faces', (count) => {
    const workspaces = new Set<THREE.Vector3>();
    const cross = vi.spyOn(THREE.Vector3.prototype, 'cross');
    const addScaledVector = THREE.Vector3.prototype.addScaledVector;
    const add = vi.spyOn(THREE.Vector3.prototype, 'addScaledVector').mockImplementation(function (
      this: THREE.Vector3,
      v,
      scale,
    ) {
      workspaces.add(this);

      return addScaledVector.call(this, v, scale);
    });

    try {
      const solid = new ShapeSolid(repeatedTriangles(count));

      expect(solid.faces.areas).toHaveLength(count * 4);
      expect(add).toHaveBeenCalledTimes(count * 4 * 3);
      expect(workspaces.size).toBe(1);
      expect(cross).toHaveBeenCalledTimes(count);
    } finally {
      add.mockRestore();
      cross.mockRestore();
    }
  });

  it('keeps replacement and separately sampled buffers independent', () => {
    const original = new ShapeSolid(rounded(triangle));
    const before = original.faces.centers.slice();
    const replacement = new ShapeSolid(repeatedTriangles(1, 20));
    const copy = new ShapeSolid(original.positions.slice());

    expect(replacement.faces.areas).toHaveLength(9);
    expect(copy.faces).not.toBe(original.faces);
    expect(copy.faces.centers).toEqual(before);
    expect(original.faces.centers).toEqual(before);
    replacement.faces.centers.fill(0);
    expect(original.faces.centers).toEqual(before);
  });
});
