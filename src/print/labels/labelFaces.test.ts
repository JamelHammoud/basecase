import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { weld, type MeshData } from '../threeMf';
import { flatFaces } from './labelFaces';

function boxMesh(n: number): MeshData {
  const geometry = new THREE.BoxGeometry(3 + n, 5 + n / 2, 7 + n / 4, 2, 2, 2);

  geometry.rotateX(n / 13);
  geometry.rotateY(n / 7);
  geometry.translate(n - 20, 3 - n, n / 3);

  const mesh = weld(geometry.toNonIndexed().attributes.position.array as Float32Array);

  geometry.dispose();

  return mesh;
}

function separateTriangles(count: number): MeshData {
  const vertices = new Float32Array(count * 9);

  for (let t = 0; t < count; t++) vertices.set([t * 3, 0, 0, t * 3 + 2, 0, 0, t * 3, 1, 0], t * 9);

  return { vertices, indices: Uint32Array.from({ length: count * 3 }, (_, i) => i) };
}

describe('printed-label face areas', () => {
  it('retains complete faces and their order across area thresholds on transformed indexed meshes', () => {
    for (let n = 0; n < 80; n++) {
      const mesh = boxMesh(n);
      const saved = structuredClone(mesh);
      const faces = flatFaces(mesh, 0);

      expect(faces).toHaveLength(6);
      expect(faces.reduce((sum, face) => sum + face.area, 0)).toBeCloseTo(
        2 * ((3 + n) * (5 + n / 2) + (5 + n / 2) * (7 + n / 4) + (7 + n / 4) * (3 + n)),
        1,
      );

      const area = faces[n % faces.length].area;

      for (const threshold of [-1, area - 1e-7, area, area + 1e-7, Infinity, NaN]) {
        expect(flatFaces(mesh, threshold)).toEqual(faces.filter((face) => face.area >= threshold));
      }

      expect(mesh).toEqual(saved);
    }
  });

  it('filters connected faces independently even when their shared plane qualifies', () => {
    const mesh = separateTriangles(2);

    expect(flatFaces(mesh, 1)).toHaveLength(2);
    expect(flatFaces(mesh, 1).map((face) => face.area)).toEqual([1, 1]);
    expect(flatFaces(mesh, 1 + Number.EPSILON)).toEqual([]);
    expect(flatFaces(mesh, 2)).toEqual([]);
    expect(flatFaces({ vertices: new Float32Array(), indices: new Uint32Array() }, 0)).toEqual([]);
  });

  it('keeps degeneracy and winding separate from the plane area threshold', () => {
    const mesh = separateTriangles(3);

    mesh.vertices.set([0, 0, 0, 0, 0, 0, 0, 0, 0], 0);
    mesh.indices.set([6, 8, 7], 6);

    const faces = flatFaces(mesh, 1);

    expect(faces).toHaveLength(2);
    expect(faces.map((face) => face.area)).toEqual([1, 1]);
    expect(faces.map((face) => face.normal[2])).toEqual([1, -1]);
    expect(flatFaces(mesh, 1 + Number.EPSILON)).toEqual([]);
    mesh.vertices[7] = 1e-7;
    expect(flatFaces(mesh, 0)).toEqual(faces);
  });

  it('reads edits and typed-array views afresh and returns independent face buffers', () => {
    const source = separateTriangles(1);
    const storage = new Float32Array(source.vertices.length + 2);

    storage.set(source.vertices, 1);

    const mesh = { vertices: storage.subarray(1, -1), indices: source.indices };
    const first = flatFaces(mesh, 1);
    const saved = structuredClone(first);

    mesh.vertices[7] = 2;

    const edited = flatFaces(mesh, 1.5);

    expect(edited[0].area).toBe(2);
    expect(first).toEqual(saved);
    edited[0].tris.fill(999);
    edited[0].edges.fill(999);
    expect(flatFaces(mesh, 1.5)[0].area).toBe(2);
    expect(flatFaces(mesh, 1.5)[0].tris).not.toEqual(edited[0].tris);
    expect(flatFaces(mesh, 1.5)[0].edges).not.toEqual(edited[0].edges);
    expect(storage[0]).toBe(0);
    expect(storage[storage.length - 1]).toBe(0);
    mesh.vertices[7] = 0.5;
    expect(flatFaces(mesh, 1)).toEqual([]);
  });

  it.each([300, 600])('avoids a second area pass over %i triangles in rejected and retained planes', (count) => {
    const mesh = separateTriangles(count);
    const hypot = vi.spyOn(Math, 'hypot');

    try {
      const faces = flatFaces(mesh, count + 1);
      const calls = hypot.mock.calls.length;

      expect(faces).toEqual([]);
      expect(calls).toBe(count);
      hypot.mockClear();

      const retained = flatFaces(mesh, 1);
      const retainedCalls = hypot.mock.calls.length;

      expect(retained).toHaveLength(count);
      expect(retained.every((face) => face.area === 1)).toBe(true);
      expect(retainedCalls).toBe(count * 4);
    } finally {
      hypot.mockRestore();
    }
  });
});
