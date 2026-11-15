import { describe, expect, it } from 'vitest';
import { seededRandom } from '../utils/seededRandom';
import { CellMask } from './cellMask';

type Point = [number, number, number];

const keyOf = (i: number, j: number, k: number) => ((i + 1024) * 2048 + j + 1024) * 2048 + k + 1024;

function previousTriangle(soup: Float32Array, t: number, reach: number, cells: Set<number>) {
  const size = Math.max(reach, 1e-3);
  const low = [0, 1, 2].map((axis) =>
    Math.floor((Math.min(soup[t + axis], soup[t + 3 + axis], soup[t + 6 + axis]) - reach) / size),
  );
  const high = [0, 1, 2].map((axis) =>
    Math.floor((Math.max(soup[t + axis], soup[t + 3 + axis], soup[t + 6 + axis]) + reach) / size),
  );

  for (let i = low[0]; i <= high[0]; i++)
    for (let j = low[1]; j <= high[1]; j++) for (let k = low[2]; k <= high[2]; k++) cells.add(keyOf(i, j, k));
}

function previousMask(soup: Float32Array, reach: number) {
  const cells = new Set<number>();
  const size = Math.max(reach, 1e-3);

  for (let t = 0; t + 8 < soup.length; t += 9) previousTriangle(soup, t, reach, cells);

  return (x: number, y: number, z: number) =>
    cells.has(keyOf(Math.floor(x / size), Math.floor(y / size), Math.floor(z / size)));
}

function countedSoup(soup: Float32Array) {
  const reads = new Uint32Array(soup.length);
  const counted = new Proxy(soup, {
    get(target, key) {
      if (typeof key === 'string' && /^\d+$/u.test(key)) reads[Number(key)]++;

      return Reflect.get(target, key, target);
    },
  });

  return { counted, reads };
}

describe('shell distance cell masks', () => {
  it('includes every expanded bound cell and excludes its neighbours across negative coordinates', () => {
    const mask = new CellMask(Float32Array.of(-0.25, -0.25, 0, 0.25, -0.25, 0, 0, 0.25, 0), 0.25);

    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        for (let k = -2; k <= 2; k++) {
          const inside = i >= -2 && i <= 2 && j >= -2 && j <= 2 && k >= -1 && k <= 1;

          expect(mask.has((i + 0.5) * 0.25, (j + 0.5) * 0.25, (k + 0.5) * 0.25)).toBe(inside);
        }
      }
    }

    expect(mask.has(-0.5, -0.5, -0.25)).toBe(true);
    expect(mask.has(0.75, 0, 0)).toBe(false);
    expect(mask.has(-0.5 - Number.EPSILON, 0, 0)).toBe(false);
  });

  it('matches previous masks across triangle order, cell sizes, degeneracy and query boundaries', () => {
    const random = seededRandom('ce11ce11ce11ce11ce11ce11ce11ce11');
    const reaches = [-0.001, 0, 0.0003, 0.001, 0.25, 1, 2];

    for (let fixture = 0; fixture < 140; fixture++) {
      const reach = reaches[fixture % reaches.length];
      const size = Math.max(reach, 1e-3);
      const soup = Float32Array.from({ length: (fixture % 5) * 9 }, () => ((Math.floor(random() * 17) - 8) * size) / 2);
      const source = soup.slice();
      const mask = new CellMask(soup, reach);
      const previous = previousMask(soup, reach);
      const points: Point[] = Array.from({ length: 250 }, () => [
        (Math.floor(random() * 17) - 8) * size,
        (random() * 16 - 8) * size,
        (Math.floor(random() * 17) - 8) * size,
      ]);

      expect(points.map((point) => mask.has(...point))).toEqual(points.map((point) => previous(...point)));
      expect(soup).toEqual(source);

      const reversed = Float32Array.from(
        Array.from({ length: soup.length / 9 }, (_, i) =>
          Array.from(soup.subarray(soup.length - (i + 1) * 9, soup.length - i * 9)),
        ).flat(),
      );
      const other = new CellMask(reversed, reach);

      expect(points.map((point) => other.has(...point))).toEqual(points.map((point) => previous(...point)));
    }
  });

  it('keeps views, incomplete triangles, nonfinite queries and cell-key behavior unchanged', () => {
    const backing = Float32Array.of(99, 98, 97, -1, 0, 0, 1, 0, 0, 0, 1, 0, 96, 95);
    const soup = backing.subarray(3, 14);
    const source = backing.slice();
    const mask = new CellMask(soup, 1);
    const previous = previousMask(soup, 1);
    const points: Point[] = [
      [0, 0, 0],
      [-2, -1, -1],
      [2, 2, 1],
      [96, 95, 0],
      [2048, -2048 * 2048, 0],
      [NaN, 0, 0],
      [0, Infinity, 0],
      [0, 0, -Infinity],
    ];

    expect(points.map((point) => mask.has(...point))).toEqual(points.map((point) => previous(...point)));
    expect(backing).toEqual(source);
    expect(new CellMask(Float32Array.of(NaN, 0, 0, 0, 0, 0, 0, 0, 0), 1).has(0, 0, 0)).toBe(false);
    expect(new CellMask(Float32Array.of(0, 0, 0, 0, 0, 0, 0, 0), 1).has(0, 0, 0)).toBe(false);
  });

  it.each([300, 600])('reads each coordinate once across %i triangles and rebuilds after edits', (count) => {
    const soup = Float32Array.from(Array.from({ length: count }, () => [0, 0, 0, 1, 0, 0, 0, 1, 0]).flat());
    const source = soup.slice();
    const { counted, reads } = countedSoup(soup);
    const first = new CellMask(counted, 1);

    expect(reads.every((value) => value === 1)).toBe(true);
    expect(first.has(0, 0, 0)).toBe(true);
    expect(first.has(20, 0, 0)).toBe(false);
    expect(soup).toEqual(source);
    reads.fill(0);
    previousMask(counted, 1);
    expect(reads.every((value) => value === 2)).toBe(true);

    for (let i = 0; i < soup.length; i += 3) soup[i] += 20;

    reads.fill(0);

    const second = new CellMask(counted, 1);

    expect(reads.every((value) => value === 1)).toBe(true);
    expect(second.has(0, 0, 0)).toBe(false);
    expect(second.has(20, 0, 0)).toBe(true);
    expect(first.has(0, 0, 0)).toBe(true);
    expect(first.has(20, 0, 0)).toBe(false);
  });
});
