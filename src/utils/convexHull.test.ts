import { describe, expect, it } from 'vitest';
import { convexHull, type HullPoint } from './convexHull';
import { convexHull as engineeringHull } from './engineeringMath';

describe('planar convex hull', () => {
  it('keeps the counterclockwise outline and removes concave, duplicate and collinear interior points', () => {
    const points: HullPoint[] = [
      [2, 2],
      [1, 1],
      [0, 0],
      [2, 0],
      [0, 2],
      [1, 0],
      [0, 0],
    ];
    const before = structuredClone(points);
    const hull = convexHull(points);

    expect(hull).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ]);
    expect(points).toEqual(before);
    expect(hull.every((point) => points.includes(point))).toBe(true);
    expect(engineeringHull).toBe(convexHull);
  });

  it('retains sorted small inputs and both endpoints of degenerate outlines', () => {
    expect(convexHull([])).toEqual([]);
    expect(convexHull([[3, 4]])).toEqual([[3, 4]]);
    expect(
      convexHull([
        [2, 1],
        [-1, 4],
      ]),
    ).toEqual([
      [-1, 4],
      [2, 1],
    ]);
    expect(
      convexHull([
        [1, 1],
        [1, 1],
      ]),
    ).toEqual([
      [1, 1],
      [1, 1],
    ]);
    expect(
      convexHull([
        [2, 2],
        [1, 1],
        [0, 0],
        [1, 1],
      ]),
    ).toEqual([
      [0, 0],
      [2, 2],
    ]);
    expect(
      convexHull([
        [1, 1],
        [1, 1],
        [1, 1],
      ]),
    ).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });

  it.each([300, 600])('encloses %i points with a strictly convex outline', (count) => {
    const points: HullPoint[] = Array.from({ length: count }, (_, i) => [
      Math.sin(i * 17) * (i % 29),
      Math.cos(i * 13) * (i % 31),
    ]);
    const hull = convexHull(points);

    for (let i = 0; i < hull.length; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      const side = (p: HullPoint) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

      expect(side(hull[(i + 2) % hull.length])).toBeGreaterThan(0);
      expect(points.every((point) => side(point) >= -1e-10)).toBe(true);
    }
  });
});
