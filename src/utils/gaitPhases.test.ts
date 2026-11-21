import { describe, expect, it } from 'vitest';
import { alternatingPhases } from './gait';
import type { V3 } from './kinematics';

function previousPhases(points: V3[]): number[] {
  const middle = (Math.max(...points.map((p) => p[0])) + Math.min(...points.map((p) => p[0]))) / 2;
  const phases = new Array<number>(points.length).fill(0);

  [0, 1].forEach((side) => {
    points
      .map((p, i) => ({ i, z: p[2], onSide: side === 0 ? p[0] < middle : p[0] >= middle }))
      .filter((p) => p.onSide)
      .sort((a, b) => a.z - b.z)
      .forEach((p, rank) => (phases[p.i] = (rank + side) % 2 === 0 ? 0 : 0.5));
  });

  return phases;
}

describe('alternating foot phases', () => {
  it('keeps source order for tied feet and puts centerline feet on the right', () => {
    const points: V3[] = [
      [-2, 0, 1],
      [2, 0, 1],
      [0, 0, 1],
      [-2, 0, 1],
      [2, 0, -1],
      [-2, 0, -1],
    ];

    expect(alternatingPhases(points)).toEqual([0.5, 0, 0.5, 0, 0.5, 0]);
  });

  it('matches the previous side ranking across layouts, edits and nonfinite coordinates', () => {
    const layouts: V3[][] = [
      [],
      [[0, 0, 0]],
      [
        [-Infinity, 0, 1],
        [Infinity, 0, 2],
      ],
      [
        [NaN, 0, 0],
        [1, 0, 1],
      ],
    ];

    for (let count = 2; count <= 64; count++) {
      const points = Array.from({ length: count }, (_, i): V3 => [((i * 7) % 5) - 2, i, (i * 13) % 7]);

      layouts.push(points, [...points].reverse());
    }

    layouts.push([
      [-1, 0, NaN],
      [-1, 0, 2],
      [1, 0, Infinity],
      [1, 0, -Infinity],
    ]);

    for (const points of layouts) {
      const original = structuredClone(points);

      expect(alternatingPhases(points)).toEqual(previousPhases(points));
      expect(points).toEqual(original);

      if (!points.length) continue;

      points[0] = [3, 0, -4];
      expect(alternatingPhases(points)).toEqual(previousPhases(points));
    }
  });
});
