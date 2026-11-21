import { afterEach, describe, expect, it, vi } from 'vitest';
import { planarDiameter } from './planarDiameter';
import { seededRandom } from './seededRandom';

const reference = (points: readonly (readonly number[])[]) =>
  points
    .flatMap((a) => points.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])))
    .reduce((best, distance) => Math.max(best, distance), -Infinity);

afterEach(() => vi.restoreAllMocks());

describe('planar diameter', () => {
  it('matches all ordered pairs across generated point clouds and later edits', () => {
    const random = seededRandom('0123456789abcdef0123456789abcdef');

    for (let trial = 0; trial < 100; trial++) {
      const points = Array.from({ length: trial % 30 }, () => [random() * 1000, random() * 1000, random()]);
      const saved = structuredClone(points);

      expect(planarDiameter(points)).toBe(reference(points));
      expect(points).toEqual(saved);
      points.push([-300, 200, Infinity]);
      expect(planarDiameter(points)).toBe(reference(points));
      points[0][0] = 2000;
      expect(planarDiameter(points)).toBe(reference(points));
    }
  });

  it('preserves empty, repeated, nonfinite and extreme coordinate results', () => {
    const fixtures = [
      [],
      [[-0, 0]],
      [[Infinity, 0]],
      [[NaN, 0]],
      [[0, -Infinity]],
      [
        [0, 0],
        [0, 0],
      ],
      [
        [-1e308, 0],
        [1e308, 0],
      ],
      [
        [0, 0],
        [1e-300, 1e-300],
      ],
      [
        [0, 0],
        [0.01, 0],
      ],
      [
        [0, 0],
        [0.009999, 0],
      ],
      [
        [0, 0, Infinity],
        [3, 4, NaN],
      ],
    ];

    for (const points of fixtures) {
      const frozen = Object.freeze(points.map((p) => Object.freeze(p)));

      expect(planarDiameter(frozen)).toBe(reference(frozen));
      expect(Math.max(0, planarDiameter(frozen))).toBe(Math.max(0, reference(frozen)));
    }
  });

  it.each([12, 300, 600])('measures each unordered pair once for %d points', (count) => {
    const points = Array.from({ length: count }, (_, i) => [i, Math.sin(i)]);
    const expected = reference(points);
    const hypot = vi.spyOn(Math, 'hypot');

    expect(planarDiameter(points)).toBe(expected);
    expect(hypot).toHaveBeenCalledTimes((count * (count + 1)) / 2);
  });
});
