import { describe, expect, it } from 'vitest';
import { supportMargin } from './feasibilityStance';
import type { V3 } from './feasibilityKinematics';

describe('support polygon margin', () => {
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
