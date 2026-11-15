import { describe, expect, it } from 'vitest';
import type { V3 } from '../utils/kinematics';
import { coversFloorPoint, prepareFloorTriangle } from './floorTriangle';

type Triangle = [V3, V3, V3];

function previousCoverage(point: V3, [a, b, c]: Triangle): boolean {
  const cross = (p: V3, q: V3) => (q[0] - p[0]) * (point[2] - p[2]) - (q[2] - p[2]) * (point[0] - p[0]);
  const sides = [cross(a, b), cross(b, c), cross(c, a)];

  return sides.every((value) => value >= -1e-6) || sides.every((value) => value <= 1e-6);
}

const clockwise: Triangle = [
  [0, 0, 0],
  [0, 0, 10],
  [10, 0, 0],
];

function probes(triangle: Triangle, seed: number): V3[] {
  const [a, b, c] = triangle;
  const points = Array.from({ length: 80 }, (_, i): V3 => {
    const u = Math.sin(seed * 31 + i * 17);
    const v = Math.cos(seed * 11 + i * 23);

    return [a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]), i, a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2])];
  });

  return [...triangle, ...points];
}

describe('prepared floor triangle coverage', () => {
  it('includes vertices and edges in either winding while preserving the cross-product tolerance', () => {
    const points: V3[] = [
      [0, 0, 0],
      [5, 0, 5],
      [2, 100, 3],
      [-1e-7, 0, 5],
      [-1.01e-7, 0, 5],
      [6, 0, 6],
    ];

    for (const triangle of [clockwise, [...clockwise].reverse() as Triangle]) {
      const prepared = prepareFloorTriangle(triangle);

      expect(points.map((point) => coversFloorPoint(point, prepared))).toEqual([true, true, true, true, false, false]);
    }
  });

  it('matches unprepared coverage across translated, rotated and scaled triangles without changing sources', () => {
    for (let seed = 0; seed < 120; seed++) {
      const scale = 10 ** ((seed % 9) - 4);
      const angle = seed * 0.41;
      const triangle = clockwise.map(([x, y, z]): V3 => [
        123.4 * seed + scale * (x * Math.cos(angle) - z * Math.sin(angle)),
        y,
        -45.6 * seed + scale * (x * Math.sin(angle) + z * Math.cos(angle)),
      ]) as Triangle;
      const before = structuredClone(triangle);
      const prepared = prepareFloorTriangle(triangle);
      const points = probes(triangle, seed);

      expect(points.map((point) => coversFloorPoint(point, prepared))).toEqual(
        points.map((point) => previousCoverage(point, triangle)),
      );
      expect(triangle).toEqual(before);
    }
  });

  it('preserves degenerate and nonfinite query results', () => {
    const triangles: Triangle[] = [
      clockwise,
      [
        [0, 0, 0],
        [1, 0, 1],
        [2, 0, 2],
      ],
      [
        [1, 0, 1],
        [1, 0, 1],
        [1, 0, 1],
      ],
      [
        [NaN, 0, 0],
        [0, 0, 1],
        [1, 0, 0],
      ],
      [
        [Infinity, 0, 0],
        [0, 0, 1],
        [1, 0, 0],
      ],
    ];
    const points: V3[] = [
      [0, 0, 0],
      [1, NaN, 1],
      [3, 0, 3],
      [NaN, 0, 0],
      [Infinity, 0, 0],
      [-Infinity, 0, 0],
    ];

    for (const triangle of triangles) {
      const prepared = prepareFloorTriangle(triangle);

      expect(points.map((point) => coversFloorPoint(point, prepared))).toEqual(
        points.map((point) => previousCoverage(point, triangle)),
      );
    }
  });

  it('owns prepared edges and reads replacement geometry afresh', () => {
    const triangle = structuredClone(clockwise);
    const first = prepareFloorTriangle(triangle);
    const second = prepareFloorTriangle(triangle);
    const point: V3 = [2, 0, 2];

    triangle.forEach((vertex) => (vertex[0] += 100));

    expect(coversFloorPoint(point, first)).toBe(true);
    expect(coversFloorPoint(point, prepareFloorTriangle(triangle))).toBe(false);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);

    first[0].dx = 1000;

    expect(first).not.toEqual(second);
    expect(second).toEqual(prepareFloorTriangle(clockwise));
  });

  it.each([300, 600])('reads triangle coordinates only during preparation across %i probes', (count) => {
    let reads = 0;
    const triangle = clockwise.map(
      (vertex) =>
        new Proxy(vertex, {
          get(target, key, receiver) {
            if (key === '0' || key === '2') reads++;

            return Reflect.get(target, key, receiver);
          },
        }),
    ) as Triangle;
    const points = Array.from({ length: count }, (_, i): V3 => [i % 12, 0, (i * 7) % 12]);
    const expected = points.map((point) => previousCoverage(point, triangle));

    expect(reads).toBe(18 * count);

    reads = 0;

    const prepared = prepareFloorTriangle(triangle);

    expect(reads).toBe(18);

    reads = 0;

    expect(points.map((point) => coversFloorPoint(point, prepared))).toEqual(expected);
    expect(reads).toBe(0);
  });
});
