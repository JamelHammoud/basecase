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

  it.each([300, 600])('uses one center workspace for %i faces', (count) => {
    const workspaces = new Set<THREE.Vector3>();
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
    } finally {
      add.mockRestore();
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
