import { describe, expect, it } from 'vitest';
import type { ZUpVec } from '../types/skeleton';
import { facingYaw } from './armSizing';

function previousYaw(base: ZUpVec, targets: ZUpVec[]): number {
  const bearings = targets
    .map((at) => [at[0] - base[0], at[1] - base[1]])
    .filter(([x, y]) => Math.hypot(x, y) > 1)
    .map(([x, y]) => Math.atan2(y, x) * (180 / Math.PI))
    .sort((a, b) => a - b);

  if (!bearings.length) return 0;

  const gaps = bearings.map((b, i) => (i ? b - bearings[i - 1] : b + 360 - bearings[bearings.length - 1]));
  const widest = gaps.indexOf(Math.max(...gaps));

  return Math.round(bearings[widest] + (360 - gaps[widest]) / 2 + 90);
}

describe('arm facing direction', () => {
  it('keeps the first widest gap and ignores targets within one millimeter', () => {
    const base: ZUpVec = [10, -20, 30];

    expect(facingYaw(base, [])).toBe(0);
    expect(facingYaw(base, [[11, -20, 300]])).toBe(0);
    expect(facingYaw(base, [[11.001, -20, 300]])).toBe(90);
    expect(
      facingYaw(base, [
        [12, -20, 30],
        [8, -20, 30],
      ]),
    ).toBe(180);
    expect(
      facingYaw(base, [
        [8, -20, 30],
        [12, -20, 30],
      ]),
    ).toBe(180);
  });

  it('matches circular gap selection across placements, wraparound, edits and nonfinite inputs', () => {
    const base: ZUpVec = [20, -30, 40];
    const layouts: ZUpVec[][] = [
      [],
      [[0, 0, 0]],
      [[NaN, 0, 0]],
      [[Infinity, NaN, 0]],
      [
        [-Infinity, Infinity, 0],
        [Infinity, -Infinity, 0],
      ],
      [
        [-100, -29.999, 0],
        [-100, -30.001, 0],
      ],
    ];

    for (let count = 1; count <= 8; count++) {
      const points = Array.from({ length: count }, (_, i): ZUpVec => [
        ((i * 73 + count * 31) % 601) - 300,
        ((i * 37 + count * 67) % 601) - 300,
        i * 10,
      ]);

      layouts.push(points, [...points].reverse(), [...points, points[0]]);
    }

    for (const points of layouts) {
      const original = structuredClone(points);

      expect(facingYaw(base, points)).toBe(previousYaw(base, points));
      expect(points).toEqual(original);
      expect(facingYaw([0, 0, 0], points)).toBe(previousYaw([0, 0, 0], points));
      points.push([300, -400, 0]);
      expect(facingYaw(base, points)).toBe(previousYaw(base, points));
    }
  });
});
