import { describe, expect, it } from 'vitest';
import { gaitBounds } from './gaitBounds';
import type { V3 } from './kinematics';

function previousBounds(points: V3[]) {
  const xs = points.map((point) => point[0]);

  return {
    footY: Math.min(...points.map((point) => point[1])),
    spread: Math.max(...xs) - Math.min(...xs),
    middle: (Math.max(...xs) + Math.min(...xs)) / 2,
  };
}

describe('gait foot bounds', () => {
  it('preserves gait defaults across layouts, nonfinite coordinates and edits', () => {
    const layouts: V3[][] = [
      [],
      [[-0, -0, 0]],
      [[0, 0, 0]],
      [[NaN, 5, 0]],
      [[2, NaN, 0]],
      [[Infinity, -Infinity, 0]],
      [[-Infinity, Infinity, 0]],
      [
        [Number.MAX_VALUE, 0, 0],
        [Number.MAX_VALUE, 1, 0],
      ],
    ];

    for (let count = 1; count <= 64; count++) {
      const points = Array.from({ length: count }, (_, i): V3 => [((i * 37) % 29) - 14, i % 7, i * -2]);

      layouts.push(points, [...points].reverse());
    }

    for (const points of layouts) {
      const original = structuredClone(points);

      expect(gaitBounds(points)).toEqual(previousBounds(points));
      expect(points).toEqual(original);

      if (!points.length) continue;

      points[0] = [-100, -50, 10];
      expect(gaitBounds(points)).toEqual(previousBounds(points));
    }
  });

  it('reads each foot once and handles layouts beyond argument-spread limits', () => {
    let reads = 0;
    const points = Array.from({ length: 160_000 }, (_, i): V3 => [i - 80_000, -i, i]);
    const counted = new Proxy(points, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        return Reflect.get(target, key, receiver);
      },
    });

    expect(gaitBounds(counted)).toEqual({ footY: -159_999, spread: 159_999, middle: -0.5 });
    expect(reads).toBe(points.length);
  });
});
