import { describe, expect, it } from 'vitest';
import { surfaceSampleIndex } from './surfaceSampleIndex';

describe('cumulative surface-area lookup', () => {
  it('keeps the first boundary match and clamps empty or out-of-range queries', () => {
    for (const values of [[], [0], [1], [0, 0, 1, 1, 1, 2, 4, 4], [3, 3, 3]]) {
      const storage = Float64Array.from([99, ...values, 99]);
      const view = storage.subarray(1, values.length + 1);

      for (const target of [-Infinity, -1, -0, 0, 0.5, 1, 1.5, 2, 3, 4, 5, Infinity, NaN]) {
        const found = values.findIndex((v) => v >= target);
        const expected = Number.isNaN(target) ? 0 : Math.max(0, found < 0 ? values.length - 1 : found);

        expect(surfaceSampleIndex(values, target)).toBe(expected);
        expect(surfaceSampleIndex(view, target)).toBe(expected);
      }

      expect(Array.from(storage)).toEqual([99, ...values, 99]);
    }
  });

  it('preserves double-precision boundaries and repeated infinite prefixes', () => {
    const values = [0, 1, 1 + Number.EPSILON, 2, Infinity, Infinity];

    for (const target of values) {
      expect(surfaceSampleIndex(values, target)).toBe(values.findIndex((v) => v >= target));
    }

    expect(surfaceSampleIndex([NaN, NaN], NaN)).toBe(0);
  });

  it.each([300, 600])('bounds 40 sample searches over %i triangles logarithmically', (count) => {
    let reads = 0;
    let seed = 7;
    const values = Array.from({ length: count }, (_, i) => i + 1);
    const measured = Object.fromEntries(
      values.map((value, i) => [
        i,
        {
          get: () => {
            reads++;

            return value;
          },
        },
      ]),
    );
    const cumulative = Object.defineProperties({ length: count }, measured) as ArrayLike<number>;

    for (let i = 0; i < 40; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;

      const target = (seed / 4294967296) * count;

      expect(surfaceSampleIndex(cumulative, target)).toBe(values.findIndex((v) => v >= target));

      seed = (seed * 1664525 + 1013904223) >>> 0;
      seed = (seed * 1664525 + 1013904223) >>> 0;
    }

    expect(reads).toBeLessThanOrEqual(40 * Math.ceil(Math.log2(count)));
  });
});
