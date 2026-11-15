import { afterEach, describe, expect, it, vi } from 'vitest';
import { frozenQuery, frozenRegions } from './lightenFrozen';
import type { LightenInput } from './lightenTypes';
import { hexMesh, nodesNear, type ScrewLine } from './mesh';
import type { V3 } from './material';
import { screwRegion } from './screwRegion';

afterEach(() => vi.restoreAllMocks());

const line: ScrewLine = { from: [0, 0, 0], to: [0, 0, 10], radius: 2 };

describe('prepared mounting regions', () => {
  it('keeps radial and end boundaries inclusive without extending the radius by axial slack', () => {
    const contains = screwRegion({ ...line, to: [0, 0, 8] }, 1);
    const inside: V3[] = [
      [2, 0, 0],
      [0, -2, 8],
      [0, 0, -1],
      [0, 0, 9],
      [1, 1, 5],
    ];
    const outside: V3[] = [
      [2.000001, 0, 5],
      [0, 0, -1.000001],
      [0, 0, 9.000001],
    ];

    expect(inside.map(contains)).toEqual(inside.map(() => true));
    expect(outside.map(contains)).toEqual(outside.map(() => false));
  });

  it('preserves rounding at an end boundary that is not exactly representable', () => {
    const contains = screwRegion(line, 1);

    expect(contains([0, 0, 10.999999])).toBe(true);
    expect(contains([0, 0, 11])).toBe(false);
    expect(contains([0, 0, 11.000001])).toBe(false);
  });

  it('handles reversed, oblique and zero-length lines', () => {
    const forward = screwRegion({ from: [1, 2, 3], to: [4, 6, 3], radius: 2 }, 0.5);
    const reversed = screwRegion({ from: [4, 6, 3], to: [1, 2, 3], radius: 2 }, 0.5);
    const points: V3[] = [
      [2.5, 4, 5],
      [2.5, 4, 5.001],
      [0.4, 1.2, 3],
      [4.6, 6.8, 3],
    ];

    expect(points.map(forward)).toEqual([true, false, false, false]);
    expect(points.map(reversed)).toEqual(points.map(forward));

    const collapsed = screwRegion({ from: [1, 2, 3], to: [1, 2, 3], radius: 2 }, 0);

    expect(collapsed([1, 2, 5])).toBe(true);
    expect(collapsed([1, 2, 5.001])).toBe(false);
  });

  it.each([300, 600])('prepares each screw once while marking %i mesh cells', (count) => {
    const mesh = hexMesh({ origin: [0, 0, 0], h: [1, 1, 1], n: [count, 1, 1], solid: new Uint8Array(count).fill(1) });
    const lines: ScrewLine[] = [
      { from: [0, 0, 0], to: [0, 0, 1], radius: 0.01 },
      { from: [count, 1, 0], to: [count, 1, 1], radius: 0.01 },
    ];
    const before = structuredClone(lines);
    const sqrt = vi.spyOn(Math, 'sqrt');
    const marked = nodesNear(mesh, lines, 0);

    expect(sqrt).toHaveBeenCalledTimes(lines.length);
    expect(marked.reduce((sum, value) => sum + value, 0)).toBe(4);

    for (let n = 0; n < marked.length; n++) {
      const [x, y] = mesh.positions.subarray(n * 3, n * 3 + 2);

      expect(marked[n]).toBe((x === 0 && y === 0) || (x === count && y === 1) ? 1 : 0);
    }

    expect(lines).toEqual(before);
    expect(nodesNear(mesh, [], 1).some(Boolean)).toBe(false);
  });
});

describe('prepared frozen regions', () => {
  it('combines screw, box and plane regions with their existing slack allowances', () => {
    const regions = {
      lines: [line],
      boxes: [{ min: [10, 0, 0] as V3, max: [12, 2, 2] as V3 }],
      planes: [{ point: [0, 20, 0] as V3, normal: [0, 4, 0] as V3, halfThickness: 2 }],
    };
    const before = structuredClone(regions);
    const contains = frozenQuery(regions, 0.5);
    const points: V3[] = [
      [2.5, 0, -0.5],
      [2.50001, 0, 5],
      [9.5, -0.5, 2.5],
      [9.49999, 1, 1],
      [100, 17.5, 100],
      [100, 22.5, 100],
      [100, 22.50001, 100],
    ];

    expect(points.map(contains)).toEqual([true, false, true, false, true, true, false]);
    expect(regions).toEqual(before);
    expect(frozenQuery({})([0, 0, 0])).toBe(false);
    expect(frozenQuery({ planes: [{ point: [0, 0, 0], normal: [0, 0, 0], halfThickness: 0 }] })([9, 8, 7])).toBe(true);
  });

  it.each([300, 600])('normalizes a frozen plane once for %i cell queries', (count) => {
    const hypot = vi.spyOn(Math, 'hypot');
    const contains = frozenQuery({ planes: [{ point: [0, 0, 0], normal: [3, 4, 0], halfThickness: 1 }] });

    for (let i = 0; i < count; i++) {
      expect(contains([i, -0.75 * i, 0])).toBe(true);
      expect(contains([i + 10, -0.75 * i, 0])).toBe(false);
    }

    expect(hypot).toHaveBeenCalledTimes(1);
  });

  it('prepares changed screws and planes afresh without changing the previous query', () => {
    const regions = {
      lines: [{ ...line, to: [...line.to] as V3 }],
      planes: [{ point: [0, 20, 0] as V3, normal: [0, 1, 0] as V3, halfThickness: 1 }],
    };
    const before = frozenQuery(regions);

    regions.lines[0].to[2] = 1;
    regions.planes[0].normal = [1, 0, 0];

    const after = frozenQuery(regions);

    expect(before([0, 0, 5])).toBe(true);
    expect(after([0, 0, 5])).toBe(true);
    expect(before([1.5, 0, 5])).toBe(true);
    expect(after([1.5, 0, 5])).toBe(false);
    expect(before([100, 20, 100])).toBe(true);
    expect(after([100, 20, 100])).toBe(false);
  });

  it('retains the wall allowance around every explicit and load-bearing interface', () => {
    const input: LightenInput = {
      positions: [],
      targetShare: 0.5,
      minWallMm: 1.5,
      jobs: [
        {
          key: 'part',
          part: 'part',
          material: 'PLA',
          infillPct: 100,
          holds: [line],
          load: { origin: [0, 0, 0], axis: [0, 0, 1], torqueNmm: 10, screws: [line] },
        },
      ],
      frozen: { lines: [line], planes: [{ point: [0, 20, 0], normal: [0, 1, 0], halfThickness: 1 }] },
    };
    const regions = frozenRegions(input);
    const contains = frozenQuery(regions);

    expect(regions.lines).toHaveLength(3);
    expect(regions.lines?.map((entry) => entry.radius)).toEqual([3.5, 3.5, 3.5]);
    expect(contains([3.5, 0, 5])).toBe(true);
    expect(contains([3.500001, 0, 5])).toBe(false);
    expect(contains([100, 17.5, 100])).toBe(true);
    expect(contains([100, 17.49999, 100])).toBe(false);
    expect(line.radius).toBe(2);
  });
});
