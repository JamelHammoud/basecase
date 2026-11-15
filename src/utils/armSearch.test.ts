import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchArm, type ArmSearch } from './armSearch';

afterEach(() => vi.restoreAllMocks());

const FIXTURES: Array<{
  input: Omit<ArmSearch, 'confirm'>;
  candidates: number[][];
  distances: number;
}> = [
  {
    input: {
      base: [0, 0, 0],
      yaw: 0,
      targets: [
        [0, -300, 0],
        [120, -220, 380],
        [-260, -120, -60],
      ],
    },
    candidates: [
      [20, 75, 140, 185],
      [20, 75, 145, 180],
      [20, 75, 150, 175],
    ],
    distances: 2355,
  },
  {
    input: {
      base: [10, -20, 30],
      yaw: 35,
      targets: [
        [110, -270, 30],
        [130, -240, 330],
      ],
    },
    candidates: [
      [0, 75, 110, 165],
      [0, 75, 115, 160],
      [0, 75, 120, 155],
    ],
    distances: 652,
  },
  {
    input: { base: [0, 0, 0], yaw: 0, targets: [[0, -600, 300]] },
    candidates: [
      [0, 75, 150, 400],
      [0, 75, 155, 395],
      [0, 75, 160, 390],
    ],
    distances: 2946,
  },
];

describe('arm search distance bounds', () => {
  it.each(FIXTURES)('keeps candidate order and shares shoulder bounds for $input.targets', (fixture) => {
    const input = structuredClone(fixture.input);
    const hypot = vi.spyOn(Math, 'hypot');
    const candidates: number[][] = [];
    const result = searchArm({
      ...input,
      confirm: ({ shape }) => {
        candidates.push([shape.baseHeight, ...shape.links]);

        return candidates.length === fixture.candidates.length;
      },
    });
    const [baseHeight, ...links] = fixture.candidates.at(-1)!;

    expect(result).toEqual({ shape: { base: input.base, yaw: input.yaw, links, baseHeight } });
    expect(candidates).toEqual(fixture.candidates);
    expect(hypot.mock.calls.length).toBeLessThanOrEqual(fixture.distances);
    expect(input).toEqual(fixture.input);
  });

  it('rebuilds bounds after targets, placement and bearing change', () => {
    const input = structuredClone(FIXTURES[0].input);
    const confirm = () => true;
    const first = searchArm({ ...input, confirm });

    for (const fixture of FIXTURES.slice(1)) {
      Object.assign(input, structuredClone(fixture.input));

      const [baseHeight, ...links] = fixture.candidates[0];

      expect(searchArm({ ...input, confirm })).toEqual({
        shape: { base: input.base, yaw: input.yaw, baseHeight, links },
      });
    }

    expect(searchArm({ ...FIXTURES[0].input, confirm })).toEqual(first);
  });

  it('preserves target blame without confirming unreachable arms', () => {
    const confirm = vi.fn(() => true);
    const input = { ...FIXTURES[0].input, confirm };

    expect(
      searchArm({
        ...input,
        targets: [
          [0, -300, 0],
          [2000, 0, 0],
        ],
      }),
    ).toEqual({ blame: 1 });
    expect(searchArm({ ...input, targets: [[0, 0, 0]] })).toEqual({ blame: 0 });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('keeps shortest-total and link tie order without targets', () => {
    const candidates: number[][] = [];

    searchArm({
      base: [0, 0, 0],
      yaw: 0,
      targets: [],
      confirm: ({ shape }) => {
        candidates.push([shape.baseHeight, ...shape.links]);

        return candidates.length === 3;
      },
    });

    expect(candidates).toEqual([
      [0, 75, 75, 75],
      [0, 75, 75, 80],
      [0, 75, 80, 75],
    ]);
  });
});
