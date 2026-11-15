import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { V3 } from './material';
import { voxelize, voxelizeAt, type VoxelGrid } from './voxels';

function trianglesOf(geometry: THREE.BufferGeometry): Float32Array {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const triangles = new Float32Array(flat.attributes.position.array);

  flat.dispose();
  geometry.dispose();

  return triangles;
}

function referenceGrid(triangles: ArrayLike<number>, spacing: number): VoxelGrid {
  const coordinates = [0, 1, 2].map((axis) =>
    Array.from({ length: triangles.length / 3 }, (_, i) => triangles[i * 3 + axis]),
  );
  const origin = coordinates.map((values) => Math.min(...values)) as V3;
  const extent = coordinates.map((values, axis) => Math.max(...values) - origin[axis]);
  const n = extent.map((value) => Math.max(1, Math.round(value / spacing))) as V3;
  const h = extent.map((value, axis) => Math.max(1e-6, value / n[axis])) as V3;

  return { origin, n, h, solid: new Uint8Array(n[0] * n[1] * n[2]) };
}

function rayFaces(triangles: ArrayLike<number>): THREE.Triangle[] {
  const faces: THREE.Triangle[] = [];

  for (let offset = 0; offset < triangles.length; offset += 9) {
    const a = new THREE.Vector3().fromArray(triangles, offset);
    const b = new THREE.Vector3().fromArray(triangles, offset + 3);
    const c = new THREE.Vector3().fromArray(triangles, offset + 6);
    const determinant = (b.y - a.y) * (c.z - a.z) - (c.y - a.y) * (b.z - a.z);

    if (Math.abs(determinant) >= 1e-12) faces.push(new THREE.Triangle(a, b, c));
  }

  return faces;
}

function expectedGrid(triangles: ArrayLike<number>, spacing: number): VoxelGrid {
  const grid = referenceGrid(triangles, spacing);
  const faces = rayFaces(triangles);
  const point = new THREE.Vector3();
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(1, 0, 0));

  for (let k = 0; k < grid.n[2]; k++) {
    for (let j = 0; j < grid.n[1]; j++) {
      ray.origin.set(
        grid.origin[0] - 1,
        grid.origin[1] + (j + 0.5 + 0.000137) * grid.h[1],
        grid.origin[2] + (k + 0.5 + 0.000291) * grid.h[2],
      );

      const hits = faces
        .flatMap((face) => (ray.intersectTriangle(face.a, face.b, face.c, false, point) ? [point.x] : []))
        .sort((a, b) => a - b);

      for (let i = 0; i < grid.n[0]; i++) {
        const x = grid.origin[0] + (i + 0.5) * grid.h[0];
        const filled = hits.some((entry, p) => p % 2 === 0 && p + 1 < hits.length && x >= entry && x <= hits[p + 1]);

        grid.solid[(k * grid.n[1] + j) * grid.n[0] + i] = Number(filled);
      }
    }
  }

  return grid;
}

const geometries = [
  () => new THREE.BoxGeometry(8.3, 6.7, 4.9, 2, 3, 2),
  () => new THREE.SphereGeometry(5.3, 10, 6),
  () => new THREE.CylinderGeometry(2.3, 4.1, 8.7, 10, 2),
  () => new THREE.TorusGeometry(4.3, 1.4, 6, 12),
];

function transformedTriangles(index: number): Float32Array {
  const geometry = geometries[index % geometries.length]();

  geometry.scale(index % 2 ? -1.2 : 0.7, 1.3, 0.9);
  geometry.rotateX(index * 0.137);
  geometry.rotateY(index * -0.193);
  geometry.rotateZ(index * 0.271);
  geometry.translate(index * 0.31, index * -0.17, index * 0.23);

  return trianglesOf(geometry);
}

afterEach(() => vi.restoreAllMocks());

describe('voxel triangle rasterization', () => {
  it('matches independent ray intersections for curved, holed, reflected and transformed solids', () => {
    for (let index = 0; index < 24; index++) {
      const triangles = transformedTriangles(index);
      const before = triangles.slice();

      for (const spacing of [0.9, 1.5, 2.7]) {
        expect(voxelizeAt(triangles, spacing)).toEqual(expectedGrid(triangles, spacing));
      }

      expect(triangles).toEqual(before);
    }
  });

  it('keeps solid boxes full across anisotropic cells, reversed winding and split faces', () => {
    const triangles = trianglesOf(new THREE.BoxGeometry(8.3, 6.7, 4.9, 3, 4, 5).translate(-4.2, 0.31, 2.37));
    const reversed = new Float64Array(triangles.length);

    for (let offset = 0; offset < triangles.length; offset += 9) {
      reversed.set(triangles.subarray(offset, offset + 3), offset);
      reversed.set(triangles.subarray(offset + 6, offset + 9), offset + 3);
      reversed.set(triangles.subarray(offset + 3, offset + 6), offset + 6);
    }

    const grid = voxelizeAt(triangles, 1.5);

    expect(grid.n).toEqual([6, 4, 3]);
    expect(grid.solid).toEqual(new Uint8Array(72).fill(1));
    expect(voxelizeAt(reversed, 1.5)).toEqual(grid);
    expect(voxelizeAt(Array.from(triangles), 1.5)).toEqual(grid);
  });

  it('keeps cavities and separated solids without filling the gaps between hit pairs', () => {
    const outer = trianglesOf(new THREE.BoxGeometry(12, 12, 12));
    const inner = trianglesOf(new THREE.BoxGeometry(6, 6, 6));
    const distant = trianglesOf(new THREE.BoxGeometry(3, 3, 3).translate(12, 0, 0));
    const triangles = Float32Array.from([...outer, ...inner, ...distant]);
    const grid = voxelizeAt(triangles, 1.5);

    expect(grid).toEqual(expectedGrid(triangles, 1.5));
    expect(grid.solid.reduce((sum, value) => sum + value, 0)).toBe(456);
  });

  it('retains the projected-area cutoff, degenerate faces and single-cell dimensions', () => {
    const degenerate = new Float64Array(9);

    expect(voxelizeAt(degenerate, 1.5)).toEqual({
      origin: [0, 0, 0],
      n: [1, 1, 1],
      h: [1e-6, 1e-6, 1e-6],
      solid: Uint8Array.of(0),
    });

    for (const side of [0.5e-6, 1e-6, 2e-6]) {
      const box = trianglesOf(new THREE.BoxGeometry(6, side, side));

      expect(voxelizeAt(box, 1.5)).toEqual(expectedGrid(box, 1.5));
    }

    expect(voxelizeAt([], 1.5)).toEqual({
      origin: [Infinity, Infinity, Infinity],
      n: [1, 1, 1],
      h: [1e-6, 1e-6, 1e-6],
      solid: Uint8Array.of(0),
    });
  });

  it('reads edited source geometry afresh and gives each call an independent mask', () => {
    const triangles = transformedTriangles(7);
    const before = triangles.slice();
    const first = voxelizeAt(triangles, 1.5);
    const saved = structuredClone(first);

    for (let i = 0; i < triangles.length; i += 3) triangles[i] += 3.25;

    const second = voxelizeAt(triangles, 1.5);

    expect(second).toEqual(expectedGrid(triangles, 1.5));
    expect(second.origin[0]).not.toBe(first.origin[0]);
    second.solid.fill(0);
    expect(first).toEqual(saved);
    expect(voxelizeAt(before, 1.5)).toEqual(first);
  });

  it('keeps the adaptive Strength grid and fixed Lighten grid on the same rasterizer', () => {
    const triangles = trianglesOf(new THREE.BoxGeometry(40, 40, 40));
    const fine = voxelizeAt(triangles, 1.5);
    const grid = voxelize(triangles);
    const coarseSpacing = 1.5 * Math.cbrt(fine.solid.length / 9000) * 1.02;

    expect(fine.solid).toHaveLength(27 ** 3);
    expect(grid).toEqual(expectedGrid(triangles, coarseSpacing));
    expect(grid.n).toEqual([20, 20, 20]);
    expect(grid.solid).toEqual(new Uint8Array(8000).fill(1));
  });

  it.each([1, 2])('copies no triangle arrays across %s subdivided boxes', (copies) => {
    const box = trianglesOf(new THREE.BoxGeometry(9, 12, 15, 5, 5, 5));
    const triangles = Float32Array.from(
      Array.from({ length: copies }, (_, copy) =>
        Array.from(box, (value, i) => value + (i % 3 === 0 ? copy * 12 : 0)),
      ).flat(),
    );
    const from = vi.spyOn(Array, 'from');
    const grid = voxelizeAt(triangles, 1.5);
    const triangleCopies = from.mock.calls.filter(([input]) => 'length' in input && input.length === 9).length;

    from.mockRestore();
    expect(triangles.length / 9).toBe(copies * 300);
    expect(triangleCopies).toBe(0);
    expect(grid).toEqual(expectedGrid(triangles, 1.5));
  });
});
