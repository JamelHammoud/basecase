import { describe, expect, it } from 'vitest';
import { supportMargin } from './feasibilityStance';
import type { V3 } from './feasibilityKinematics';
import { convexHull, type HullPoint } from '../utils/convexHull';

function previousMargin(sole: V3[], com: V3): number {
  if (sole.length < 2) return -Infinity;

  const hull = convexHull(sole.map((p) => [p[0], p[1]]));
  const p: HullPoint = [com[0], com[1]];
  const edges = hull.map((a, i) => [a, hull[(i + 1) % hull.length]] as const);
  const distance = Math.min(
    ...edges.map(([a, b]) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;

      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    }),
  );
  const inside =
    hull.length >= 3 && edges.every(([a, b]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) > 0);

  return inside ? distance : -distance;
}

describe('support polygon margin', () => {
  it('matches the preceding edge-list calculation across varied contacts and later edits', () => {
    for (let count = 0; count <= 64; count++) {
      const sole: V3[] = Array.from({ length: count }, (_, i) => [Math.sin(i * 7) * 3, Math.cos(i * 11) * 2, i]);
      const before = structuredClone(sole);
      const queries: V3[] = [
        [0, 0, 0],
        [1, 2, 3],
        [-0, 0, 1],
        [NaN, 0, 0],
        [Infinity, 1, 0],
      ];

      for (const com of queries) expect(supportMargin(sole, com)).toBe(previousMargin(sole, com));

      expect(sole).toEqual(before);
      sole.reverse();

      for (const com of queries) expect(supportMargin(sole, com)).toBe(previousMargin(sole, com));
    }
  });

  it('measures inside, outside and boundary points without depending on sole order or height', () => {
    const sole: V3[] = [
      [2, 2, 7],
      [0, 0, 3],
      [0, 2, 1],
      [2, 0, 9],
      [1, 1, 4],
      [0, 0, 3],
    ];
    const before = structuredClone(sole);

    expect(supportMargin(sole, [1, 1, 100])).toBe(1);
    expect(supportMargin(sole, [3, 1, 0])).toBe(-1);
    expect(supportMargin(sole, [0, 1, 0])).toBe(-0);
    expect(sole).toEqual(before);
  });

  it('keeps the refusal margin for no contacts or one contact and the distance for a line', () => {
    expect(supportMargin([], [0, 0, 0])).toBe(-Infinity);
    expect(supportMargin([[0, 0, 0]], [1, 1, 0])).toBe(-Infinity);
    expect(
      supportMargin(
        [
          [0, 0, 0],
          [2, 0, 0],
        ],
        [1, 1, 0],
      ),
    ).toBe(-1);
    expect(
      supportMargin(
        [
          [0, 0, 0],
          [0, 0, 0],
        ],
        [3, 4, 0],
      ),
    ).toBe(-5);
    expect(
      supportMargin(
        [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
        [1, 1, 0],
      ),
    ).toBe(-1);
  });
});
