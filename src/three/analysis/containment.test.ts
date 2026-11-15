import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { insideSolid } from '../../assembly/probe';
import { isInside, place } from './collide';
import { ShapeSolid } from './shapeSolid';

function boxSolid(size = 20): ShapeSolid {
  const geometry = new THREE.BoxGeometry(size, size, size).toNonIndexed();
  const solid = new ShapeSolid(new Float32Array(geometry.attributes.position.array));

  geometry.dispose();

  return solid;
}

const directions = Array.from({ length: 5 }, (_, i) => new THREE.Vector3(1, 0.13 + i / 10, 0.07).normalize());

function fullVote(solid: ShapeSolid, point: THREE.Vector3, dirs: THREE.Vector3[]): boolean {
  const ray = new THREE.Ray(point);

  return (
    dirs.filter((dir) => {
      ray.direction.copy(dir);

      return solid.bvh.raycast(ray, THREE.DoubleSide).filter((hit) => hit.distance > 1e-4).length % 2 === 1;
    }).length >= 2
  );
}

describe('containment votes', () => {
  it('matches every vote sequence for zero through five directions and stops when decided', () => {
    const solid = boxSolid();
    const point = new THREE.Vector3();
    const sample = solid.bvh.raycast(new THREE.Ray(point, directions[0]), THREE.DoubleSide)[0];
    const cast = vi.spyOn(solid.bvh, 'raycast');

    for (let count = 0; count <= directions.length; count++) {
      for (let mask = 0; mask < 1 << count; mask++) {
        let called = 0;

        cast.mockImplementation(() => (mask & (1 << called++) ? [sample] : []));

        const votes = Array.from({ length: count }, (_, i) => Number(Boolean(mask & (1 << i))));
        const expected = votes.reduce((sum, vote) => sum + vote, 0) >= 2;

        expect(isInside(solid, point, directions.slice(0, count))).toBe(expected);
        expect(called).toBeLessThanOrEqual(count);

        if (count === 3) expect(called).toBe(votes[0] === votes[1] ? 2 : 3);

        cast.mockClear();
      }
    }

    cast.mockRestore();
    solid.dispose();
  });

  it('keeps the strict surface cutoff and counts all forward hits before taking parity', () => {
    const solid = boxSolid();
    const point = new THREE.Vector3();
    const sample = solid.bvh.raycast(new THREE.Ray(point, directions[0]), THREE.DoubleSide)[0];
    const cast = vi.spyOn(solid.bvh, 'raycast');

    for (const distances of [[], [0], [1e-4], [1e-4 + Number.EPSILON], [0, 1, 2], [0, 1, 2, 3]]) {
      cast.mockReturnValue(distances.map((distance) => ({ ...sample, distance })));

      expect(isInside(solid, point, directions.slice(0, 3))).toBe(
        distances.filter((distance) => distance > 1e-4).length % 2 === 1,
      );
    }

    cast.mockRestore();
    solid.dispose();
  });

  it('matches full ray voting for solids, cavities, surfaces and transformed assembly probes', () => {
    const outer = boxSolid();
    const inner = boxSolid(8);
    const hollow = new ShapeSolid(new Float32Array([...outer.positions, ...inner.positions]));
    const matrix = new THREE.Matrix4().makeRotationY(0.71).setPosition(30, -20, 10);
    const assemblyDirs = [
      [1, 0.013, 0.007],
      [-0.01, 1, 0.02],
      [0.017, -0.006, 1],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());

    for (const solid of [outer, hollow]) {
      const placed = place('shell', solid, matrix);

      for (const x of [-11, -10, -9.999, -4, -3.999, 0, 3.999, 4, 9.999, 10, 11]) {
        for (const y of [-11, -10, -3, 0, 3, 10, 11]) {
          const point = new THREE.Vector3(x, y, 0.37);
          const world = point.clone().applyMatrix4(matrix);
          const local = world.clone().applyMatrix4(placed.inverse);
          const expected =
            placed.box.containsPoint(world) && solid.box.containsPoint(local) && fullVote(solid, local, assemblyDirs);

          expect(isInside(solid, point, directions.slice(0, 3))).toBe(fullVote(solid, point, directions.slice(0, 3)));
          expect(insideSolid(placed, world)).toBe(expected);
          expect(point.toArray()).toEqual([x, y, 0.37]);
        }
      }
    }

    outer.dispose();
    inner.dispose();
    hollow.dispose();
  });

  it('casts two rays for settled assembly probes and none outside their bounds', () => {
    const solid = boxSolid();
    const placed = place('box', solid, new THREE.Matrix4().makeTranslation(30, 0, 0));
    const cast = vi.spyOn(solid.bvh, 'raycast');

    expect(insideSolid(placed, new THREE.Vector3(30, 0, 0))).toBe(true);
    expect(cast).toHaveBeenCalledTimes(2);
    cast.mockClear();
    expect(insideSolid(placed, new THREE.Vector3())).toBe(false);
    expect(cast).not.toHaveBeenCalled();
    cast.mockRestore();
    solid.dispose();
  });
});
