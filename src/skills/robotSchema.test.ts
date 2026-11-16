import { describe, expect, it, vi } from 'vitest';
import { jointMap, ROBOT_SCHEMA_FORMAT, ROBOT_SCHEMA_VERSION, type RobotSchema } from './robotSchema';

function schema(limbs: Array<[number, number]>, sizes: number[]): RobotSchema {
  return {
    format: ROBOT_SCHEMA_FORMAT,
    version: ROBOT_SCHEMA_VERSION,
    bodyClass: 'legged',
    floating: true,
    limbs,
    joints: sizes.flatMap((size, limb) =>
      Array.from({ length: size }, (_, i) => ({ id: `${limb}-${i}`, limb, depth: i + 1 })),
    ),
  };
}

describe('skill limb matching', () => {
  it('keeps compatible lengths, source order on ties and reuse across target limbs', () => {
    const source = schema(
      [
        [-1, 0],
        [0, 0],
        [1, 0],
        [0, 2],
      ],
      [2, 1, 2, 3],
    );
    const target = schema(
      [
        [0, 0],
        [0.9, 0],
        [-0.9, 0],
        [0, 1.9],
        [0, 0],
      ],
      [2, 2, 2, 3, 1],
    );

    expect(jointMap(source, target)).toEqual({ ok: true, map: [0, 1, 3, 4, 0, 1, 5, 6, 7, 2] });
    expect(jointMap(source, schema([[0, 0]], [4]))).toEqual({
      ok: false,
      problem: 'This skill moves limbs of 1 and 2 and 3 joints, and this robot has limbs of 4.',
    });
  });

  it('measures each compatible pair once and ignores incompatible anchors', () => {
    const source = schema(
      [
        [-1, 0],
        [0, 0],
        [1, 0],
        [0, 2],
      ],
      [2, 1, 2, 3],
    );
    const target = schema(
      [
        [0, 0],
        [0.9, 0],
        [-0.9, 0],
      ],
      [2, 2, 2],
    );
    const hypot = vi.spyOn(Math, 'hypot');

    try {
      expect(jointMap(source, target)).toEqual({ ok: true, map: [0, 1, 3, 4, 0, 1] });
      expect(hypot).toHaveBeenCalledTimes(6);
    } finally {
      hypot.mockRestore();
    }
  });

  it('uses fresh anchors after edits and maps joints in target order', () => {
    const source = schema(
      [
        [-1, 0],
        [1, 0],
      ],
      [2, 2],
    );
    const target = schema([[0.8, 0]], [2]);

    target.joints.reverse();
    expect(jointMap(source, target)).toEqual({ ok: true, map: [3, 2] });
    source.limbs[0] = [0.8, 0];
    expect(jointMap(source, target)).toEqual({ ok: true, map: [1, 0] });
  });

  it('measures 72 pairs when mapping six limbs onto twelve compatible limbs', () => {
    const source = schema(
      Array.from({ length: 12 }, (_, i) => [i, 0]),
      Array(12).fill(1),
    );
    const target = schema(
      Array.from({ length: 6 }, (_, i) => [i * 2, 0]),
      Array(6).fill(1),
    );
    const hypot = vi.spyOn(Math, 'hypot');

    try {
      expect(jointMap(source, target)).toEqual({ ok: true, map: [0, 2, 4, 6, 8, 10] });
      expect(hypot).toHaveBeenCalledTimes(72);
    } finally {
      hypot.mockRestore();
    }
  });

  it('retains the first compatible limb for nonfinite distance ties', () => {
    const source = schema(
      [
        [Number.MAX_VALUE, Number.MAX_VALUE],
        [-Number.MAX_VALUE, -Number.MAX_VALUE],
      ],
      [1, 1],
    );
    const target = schema([[0, 0]], [1]);

    expect(jointMap(source, target)).toEqual({ ok: true, map: [0] });
    source.limbs[0] = [NaN, 0];
    expect(jointMap(source, target)).toEqual({ ok: true, map: [0] });
  });
});
