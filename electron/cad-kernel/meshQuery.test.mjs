import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MeshQuery, sampleSurface, seeded, triangleData } from './meshQuery.mjs';

const directions = [
  [0.5773, 0.5774, 0.5772],
  [-0.4082, 0.8165, 0.4083],
  [0.7071, -0.0001, -0.7071],
].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());

function boxQuery(hollow = false) {
  const outer = new THREE.BoxGeometry(20, 20, 20).toNonIndexed();
  const inner = new THREE.BoxGeometry(8, 8, 8).toNonIndexed();
  const positions = [...outer.attributes.position.array, ...(hollow ? inner.attributes.position.array : [])];

  outer.dispose();
  inner.dispose();

  return new MeshQuery({ positions, indices: Array.from({ length: positions.length / 3 }, (_, i) => i) });
}

describe('kernel containment votes', () => {
  it('keeps all eight verdicts and only casts the third ray when the first two disagree', () => {
    const query = boxQuery();
    const point = new THREE.Vector3();
    const crossings = vi.spyOn(query, 'crossings');

    for (let mask = 0; mask < 8; mask++) {
      let called = 0;

      crossings.mockImplementation(() => (mask & (1 << called++) ? 3 : 2));

      const votes = [0, 1, 2].map((i) => Boolean(mask & (1 << i)));

      expect(query.inside(point)).toBe(votes.filter(Boolean).length >= 2);
      expect(called).toBe(votes[0] === votes[1] ? 2 : 3);
      expect(crossings.mock.calls.map(([, dir]) => dir.toArray())).toEqual(
        directions.slice(0, called).map((dir) => dir.toArray()),
      );
      crossings.mockClear();
    }

    crossings.mockRestore();
    query.bvh.geometry.dispose();
  });

  it('matches full voting through real BVHs for solid and hollow meshes at their boundaries', () => {
    for (const hollow of [false, true]) {
      const query = boxQuery(hollow);

      for (const x of [-11, -10, -9.999, -4, -3.999, 0, 3.999, 4, 9.999, 10, 11]) {
        for (const y of [-11, -10, -3, 0, 3, 10, 11]) {
          const point = new THREE.Vector3(x, y, 0.37);
          const expected = directions.filter((dir) => query.crossings(point, dir) % 2 === 1).length >= 2;

          expect(query.inside(point)).toBe(expected);
          expect(point.toArray()).toEqual([x, y, 0.37]);
        }
      }

      query.bvh.geometry.dispose();
    }
  });
});

describe('kernel surface sampling', () => {
  it.each([300, 600])('preserves seeded coordinates, face indices and normals for %i points', (count) => {
    const query = boxQuery(true);
    const mesh = query.mesh;
    const saved = structuredClone(mesh);
    const triangles = triangleData(mesh);

    for (const seed of [1, 7, 31]) {
      const random = seeded(seed);
      const samples = sampleSurface(mesh, triangles, count, seed);

      for (const sample of samples) {
        const target = random() * triangles.total;
        let sum = 0;
        const tri = triangles.areas.findIndex((area) => (sum += area) >= target);
        const u0 = random();
        const v0 = random();
        const [u, v] = u0 + v0 > 1 ? [1 - u0, 1 - v0] : [u0, v0];
        const corner = (k) => new THREE.Vector3().fromArray(mesh.positions, mesh.indices[tri * 3 + k] * 3);
        const a = corner(0);
        const point = a.clone().addScaledVector(corner(1).sub(a), u).addScaledVector(corner(2).sub(a), v);

        expect(sample.tri).toBe(tri);
        expect(sample.point).toEqual(point);
        expect(sample.normal.toArray()).toEqual(Array.from(triangles.normals.slice(tri * 3, tri * 3 + 3)));
      }
    }

    expect(sampleSurface(mesh, triangles, 0)).toEqual([]);
    expect(sampleSurface(mesh, { areas: [0], normals: [0, 0, 0] }, count)).toEqual([]);
    expect(mesh).toEqual(saved);
    query.bvh.geometry.dispose();
  });
});
