import { describe, expect, it, vi } from 'vitest';
import { levelSetSolid, loadManifold, meshOfSolid } from '../wrap/manifold';
import type { FineGrid } from './lightenFineGrid';
import { sampleDensityGrid } from './lightenGrid';
import type { V3 } from './types';

function previousSample(grid: FineGrid, p: V3): number {
  const f = p.map((value, axis) => (value - grid.origin[axis]) / grid.h[axis] - 0.5);
  const base = f.map(Math.floor);
  let sum = 0;

  for (let corner = 0; corner < 8; corner++) {
    const ijk = base.map((value, axis) => value + ((corner >> axis) & 1));
    const weight = f.reduce((product, value, axis) => {
      const fraction = value - base[axis];

      return product * (((corner >> axis) & 1) === 1 ? fraction : 1 - fraction);
    }, 1);
    const inside = ijk.every((value, axis) => value >= 0 && value < grid.n[axis]);
    const value = inside ? grid.solid[(ijk[2] * grid.n[1] + ijk[1]) * grid.n[0] + ijk[0]] : 0;

    sum += weight * (value * 2 - 1);
  }

  return sum;
}

function fixture(seed: number): FineGrid {
  const n: V3 = [1 + (seed % 7), 1 + ((seed * 3) % 5), 1 + ((seed * 7) % 9)];

  return {
    n,
    origin: [seed * -0.17, seed * 0.31, seed * -0.13],
    h: [0.37 + (seed % 3), 0.73 + (seed % 5), 0.19 + (seed % 7)],
    solid: Uint8Array.from({ length: n[0] * n[1] * n[2] }, (_, cell) => Number((cell * 7 + seed) % 11 < 6)),
  };
}

function pointAt(grid: FineGrid, cell: V3): V3 {
  return cell.map((value, axis) => grid.origin[axis] + (value + 0.5) * grid.h[axis]) as V3;
}

describe('Lighten density-field sampling', () => {
  it('preserves exact samples across sparse, translated and anisotropic grids and their boundaries', () => {
    for (let seed = 0; seed < 80; seed++) {
      const grid = fixture(seed);
      const before = structuredClone(grid);
      const points: V3[] = [];

      for (let query = 0; query < 120; query++) {
        points.push(pointAt(grid, [((query * 17) % 127) / 13 - 2, ((query * 7) % 83) / 17 - 1, query / 11 - 2]));
      }

      for (const edge of [-1, -0.5, 0, 0.5, 1]) {
        points.push(pointAt(grid, [edge, edge, edge]));
        points.push(pointAt(grid, grid.n.map((value) => value + edge) as V3));
      }

      expect(points.map((point) => sampleDensityGrid(grid, point))).toEqual(
        points.map((point) => previousSample(grid, point)),
      );
      expect(grid).toEqual(before);
    }
  });

  it('interpolates a single occupied cell and blends its six boundary faces with empty space', () => {
    const grid: FineGrid = { origin: [-3, 5, 11], n: [1, 1, 1], h: [2, 4, 8], solid: Uint8Array.of(1) };

    expect(sampleDensityGrid(grid, pointAt(grid, [0, 0, 0]))).toBe(1);
    expect(sampleDensityGrid(grid, pointAt(grid, [0.25, 0.25, 0.25]))).toBe(2 * 0.75 ** 3 - 1);

    for (const axis of [0, 1, 2]) {
      for (const offset of [-1, -0.5, 0.5, 1]) {
        const cell: V3 = [0, 0, 0];

        cell[axis] = offset;
        expect(sampleDensityGrid(grid, pointAt(grid, cell))).toBe(1 - 2 * Math.abs(offset));
      }
    }
  });

  it('reads edited masks, origins and spacing without retaining results between grids', () => {
    const grid = fixture(13);
    const other = fixture(21);
    const point: V3 = [-1, 4, 2];
    const otherValue = sampleDensityGrid(other, point);

    grid.solid.fill(1);
    grid.origin = [-2, 1, -3];
    grid.h = [0.3, 1.7, 4.1];

    expect(sampleDensityGrid(grid, point)).toBe(previousSample(grid, point));
    expect(sampleDensityGrid(other, point)).toBe(otherValue);

    for (const value of [NaN, Infinity, -Infinity, -0, Number.MAX_VALUE]) {
      for (const axis of [0, 1, 2]) {
        const changed: V3 = [...point];

        changed[axis] = value;
        expect(sampleDensityGrid(grid, changed)).toBe(previousSample(grid, changed));
      }
    }
  });

  it.each([300, 600])('removes ten mapped coordinate arrays per query across %s queries', (count) => {
    const grid = fixture(17);
    const points = Array.from({ length: count }, (_, query) => pointAt(grid, [query / count, 1.3, 2.7]));
    const map = vi.spyOn(Array.prototype, 'map');

    try {
      for (const point of points) previousSample(grid, point);

      const previousArrays = map.mock.calls.length;

      map.mockClear();

      for (const point of points) sampleDensityGrid(grid, point);

      const currentArrays = map.mock.calls.length;

      map.mockRestore();
      expect(previousArrays).toBe(count * 10);
      expect(currentArrays).toBe(0);
    } finally {
      map.mockRestore();
    }
  });

  it('reconstructs the same closed surface through Manifold', async () => {
    const api = await loadManifold();

    for (const seed of [3, 11, 17]) {
      const grid = fixture(seed);
      const options = {
        box: {
          min: grid.origin.map((value, axis) => value - grid.h[axis]) as V3,
          max: grid.origin.map((value, axis) => value + (grid.n[axis] + 1) * grid.h[axis]) as V3,
        },
        edge: Math.min(...grid.h),
        tolerance: -1,
      };
      const expected = levelSetSolid(api, { ...options, sdf: (point) => previousSample(grid, point) });
      const actual = levelSetSolid(api, { ...options, sdf: (point) => sampleDensityGrid(grid, point) });

      try {
        expect(expected).not.toBeNull();
        expect(actual?.status()).toBe('NoError');
        expect(actual?.volume()).toBe(expected!.volume());
        expect(meshOfSolid(actual!)).toEqual(meshOfSolid(expected!));
      } finally {
        expected?.delete();
        actual?.delete();
      }
    }
  });
});
