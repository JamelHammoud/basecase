import { describe, expect, it } from 'vitest';
import { inside, type Edge } from './profileLoops';

type Point = Edge[number];

function exhaustiveInside(point: Point, polygon: Point[]): boolean {
  let result = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = a[1] > point[1] !== b[1] > point[1];
    const atX = ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];

    if (crosses && point[0] < atX) result = !result;
  }

  return result;
}

describe('sheet hole containment', () => {
  it('preserves crossing parity at vertices, horizontal edges and concave boundaries', () => {
    const polygons: Point[][] = [
      [],
      [[0, 0]],
      [
        [0, 0],
        [4, 4],
      ],
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
      [
        [0, 0],
        [4, 0],
        [4, 2],
        [2, 2],
        [2, 4],
        [0, 4],
      ],
      [
        [0, 0],
        [4, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0],
      ],
      [
        [0, 0],
        [4, 4],
        [0, 4],
        [4, 0],
      ],
      [
        [-Infinity, 0],
        [Infinity, 0],
        [NaN, 4],
        [0, 4],
      ],
    ];
    const coordinates = [-Infinity, -1, -0, 0.00001, 1, 2, 3, 4, 4.00001, Infinity, NaN];

    for (const polygon of polygons.flatMap((points) => [points, points.toReversed()])) {
      const original = structuredClone(polygon);

      for (const x of coordinates) {
        for (const y of coordinates) {
          expect(inside([x, y], polygon)).toBe(exhaustiveInside([x, y], polygon));
        }
      }

      expect(polygon).toEqual(original);
    }
  });

  it.each([149, 299])('reads horizontal coordinates only for crossing edges with %i subdivisions', (count) => {
    const bottom: Point[] = Array.from({ length: count + 1 }, (_, x) => [x, 0]);
    const top: Point[] = Array.from({ length: count + 1 }, (_, x) => [count - x, 4]);
    const polygon = [...bottom, ...top];
    let reads = 0;

    for (const point of polygon) {
      const x = point[0];

      Object.defineProperty(point, 0, {
        get: () => {
          reads++;

          return x;
        },
      });
    }

    expect(inside([1, 2], polygon)).toBe(true);
    expect(reads).toBe(6);
    reads = 0;
    expect(inside([1, 5], polygon)).toBe(false);
    expect(reads).toBe(0);
    top[0][1] = 1;
    expect(inside([count, 2], polygon)).toBe(exhaustiveInside([count, 2], polygon));
  });
});
