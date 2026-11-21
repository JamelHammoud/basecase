import { describe, expect, it } from 'vitest';
import { cross, lineDistance, sub, type V3 } from './engineeringMath';

const previousDistance = (point: V3, origin: V3, axis: V3) => Math.hypot(...cross(sub(point, origin), axis));

function compareCombinations(vectors: V3[]): void {
  for (const point of vectors) {
    for (const origin of vectors) {
      for (const axis of vectors) {
        expect(lineDistance(point, origin, axis)).toBe(previousDistance(point, origin, axis));
      }
    }
  }
}

describe('engineering point-to-axis distances', () => {
  it('retains exact distances across translated points, arbitrary axes and later edits', () => {
    const axes: V3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.6, 0, 0.8],
      [2, -3, 4],
      [0, 0, 0],
    ];

    for (let index = 0; index < 300; index++) {
      const point: V3 = [index / 7, (index % 19) - 9, -index / 3];
      const origin: V3 = [index % 13, index / 11, -(index % 23)];
      const originalPoint = [...point];
      const originalOrigin = [...origin];

      for (const axis of axes) {
        const originalAxis = [...axis];

        expect(lineDistance(point, origin, axis)).toBe(previousDistance(point, origin, axis));
        expect(axis).toEqual(originalAxis);
      }

      expect(point).toEqual(originalPoint);
      expect(origin).toEqual(originalOrigin);
      point[0] += 17;
      origin[2] -= 9;
      expect(lineDistance(point, origin, axes[3])).toBe(previousDistance(point, origin, axes[3]));
    }
  });

  it('preserves zero, overflow and nonfinite arithmetic', () => {
    const values = [0, -0, Number.MIN_VALUE, Number.MAX_VALUE, Infinity, -Infinity, NaN];

    for (const value of values) {
      const vectors: V3[] = [
        [value, 1, -2],
        [3, value, 4],
        [5, -6, value],
        [value, value, value],
      ];

      compareCombinations(vectors);
    }
  });
});
