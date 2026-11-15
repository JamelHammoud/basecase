import { afterEach, describe, expect, it, vi } from 'vitest';
import { legs, smoothed } from './builtinGestures';

function copiedWindows(series: number[], reach = 2): number[] {
  return series.map((_, i) => {
    const near = series.slice(Math.max(0, i - reach), i + reach + 1).filter(Number.isFinite);

    return near.length ? near.reduce((sum, value) => sum + value, 0) / near.length : Number.NaN;
  });
}

function samples(seed: number, count: number): number[] {
  const special = [NaN, Infinity, -Infinity, -0, 1e308, -1e308, 1e-300];

  return Array.from({ length: count }, (_, i) => {
    const choice = (seed * 7 + i * 11) % 29;

    return choice < special.length ? special[choice] : Math.sin(seed + i * 1.7) * (seed % 31);
  });
}

function windowCopies(smooth: () => number[]) {
  const slices = vi.spyOn(Array.prototype, 'slice');
  const filters = vi.spyOn(Array.prototype, 'filter');
  const result = smooth();
  const counts = { slices: slices.mock.calls.length, filters: filters.mock.calls.length };

  slices.mockRestore();
  filters.mockRestore();

  return { result, counts };
}

describe('gesture smoothing', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves window means exactly across missing samples, overflow and slice boundaries', () => {
    for (let seed = 0; seed < 200; seed++) {
      const source = samples(seed, seed % 91);

      Object.freeze(source);
      expect(smoothed(source)).toEqual(copiedWindows(source));

      for (const reach of [0, 1, 2, 3.5, -1, -2.5, source.length, Infinity, -Infinity, NaN]) {
        expect(smoothed(source, reach)).toEqual(copiedWindows(source, reach));
      }
    }
  });

  it('preserves sparse samples and returns independent results after source edits', () => {
    const source = new Array<number>(12);

    source[0] = 0;
    source[3] = 10;
    source[4] = NaN;
    source[8] = -5;
    source[11] = Infinity;

    const first = smoothed(source);
    const expected = copiedWindows(source);

    expect(first).toEqual(expected);
    expect(1 in first).toBe(false);
    source[3] = -20;
    source[5] = 1;
    expect(smoothed(source)).toEqual(copiedWindows(source));
    expect(first).toEqual(expected);
    expect(smoothed([NaN, Infinity, -Infinity])).toEqual([NaN, NaN, NaN]);
    expect(smoothed([])).toEqual([]);
  });

  it('preserves wave and head reversal counts at their amplitude boundaries', () => {
    for (const amplitude of [0.2, 10, 15]) {
      for (const scale of [1 - Number.EPSILON, 1, 1 + Number.EPSILON]) {
        const source = Array.from({ length: 90 }, (_, i) => (i % 18 < 9 ? 0 : amplitude * scale));

        source[20] = NaN;
        source[40] = Infinity;

        for (const reach of [1, 2]) {
          const actual = smoothed(source, reach);
          const expected = copiedWindows(source, reach);

          expect(actual).toEqual(expected);
          expect(legs(actual, amplitude)).toBe(legs(expected, amplitude));
        }
      }
    }
  });

  it.each([300, 600])('removes both temporary window arrays for each of %i samples', (count) => {
    const source = samples(17, count);
    const previous = windowCopies(() => copiedWindows(source));
    const current = windowCopies(() => smoothed(source));

    expect(current.result).toEqual(previous.result);
    expect(previous.counts).toEqual({ slices: count, filters: count });
    expect(current.counts).toEqual({ slices: 0, filters: 0 });
  });
});
