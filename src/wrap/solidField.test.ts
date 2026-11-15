import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { solidFromPositions } from '../three/analysis/shapeSolid';
import { SolidField } from './solidField';
import { insideBefore } from './windingRow';

function box(size: number, x = 0, reverse = false): Float32Array {
  const geometry = new THREE.BoxGeometry(size, size, size).toNonIndexed();

  geometry.translate(x, 0, 0);

  const positions = Float32Array.from(geometry.getAttribute('position').array);

  if (reverse) {
    for (let i = 0; i < positions.length; i += 9) {
      for (let k = 0; k < 3; k++) [positions[i + k], positions[i + 3 + k]] = [positions[i + 3 + k], positions[i + k]];
    }
  }

  geometry.dispose();

  return positions;
}

const joined = (...soups: Float32Array[]) => Float32Array.from(soups.flatMap((soup) => Array.from(soup)));

describe('cached solid winding rows', () => {
  it('matches direct winding sums for separate, nested, reversed, coincident and overlapping surfaces', () => {
    const fixtures = [
      box(8),
      box(8, 0, true),
      joined(box(8), box(4, 0, true)),
      joined(box(4, -4), box(4, 4)),
      joined(box(8), box(8, 2)),
      joined(box(8), box(8)),
      joined(box(8), box(8, 0, true)),
    ];

    for (const soup of fixtures) {
      const field = new SolidField(soup);
      const solid = solidFromPositions(soup);

      for (const [y, z] of [
        [0, 0],
        [1, -1],
        [3, 3],
        [4, 4],
        [0, 5],
      ]) {
        const ray = new THREE.Ray(
          new THREE.Vector3(solid.box.min.x - 1, y + 1.3e-4, z + 1.3e-4 * Math.SQRT2),
          new THREE.Vector3(1, 0, 0),
        );
        const hits = solid.bvh.raycast(ray, THREE.DoubleSide).filter((hit) => hit.face);

        for (let x = -10; x <= 10; x += 0.25) {
          const insideBox = solid.box.containsPoint(new THREE.Vector3(x, y, z));
          const winding = hits
            .filter((hit) => hit.point.x < x)
            .reduce((sum, hit) => sum + (hit.face!.normal.x < 0 ? 1 : -1), 0);

          expect(field.contains(x, y, z), JSON.stringify({ x, y, z })).toBe(insideBox && winding !== 0);
        }
      }

      field.dispose();
      solid.dispose();
    }
  });

  it('shares ray rows between containment and signed distance and keeps winding above 255', () => {
    const soup = joined(...Array.from({ length: 256 }, () => box(8)));
    const field = new SolidField(soup);
    const solid = solidFromPositions(soup);
    const raycast = vi.spyOn(Object.getPrototypeOf(solid.bvh), 'raycast');

    try {
      expect(field.contains(0, 0, 0)).toBe(true);
      expect(field.depth([1, 0, 0], 1)).toBe(1);
      expect(field.contains(4, 0, 0)).toBe(true);
      expect(field.contains(-4, 0, 0)).toBe(false);
      expect(field.depth([5, 0, 0], 1)).toBe(-1);
      expect(raycast).toHaveBeenCalledTimes(1);
    } finally {
      raycast.mockRestore();
      field.dispose();
      solid.dispose();
    }
  });

  it('keeps strict crossing boundaries and logarithmic lookup work on long rows', () => {
    for (const size of [0, 2, 1024, 2048]) {
      let reads = 0;
      const at = Array.from({ length: size }, (_, i) => Math.floor(i / 2));
      const inside = Uint8Array.from({ length: size + 1 }, (_, i) => (i % 4 === 0 ? 0 : 1));
      const counted = new Proxy(at, {
        get(target, key, receiver) {
          if (typeof key === 'string' && /^\d+$/u.test(key)) reads++;

          return Reflect.get(target, key, receiver);
        },
      });

      for (const x of [-Infinity, -1, 0, 0.5, size / 4, size, Infinity, NaN]) {
        reads = 0;

        const end = Number.isNaN(x) ? 0 : at.findIndex((value) => value >= x);

        expect(insideBefore({ at: counted, inside }, x)).toBe(inside[end < 0 ? size : end] !== 0);
        expect(reads).toBeLessThanOrEqual(Math.ceil(Math.log2(size + 1)));
      }
    }
  });
});
