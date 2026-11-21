import { describe, expect, it } from 'vitest';
import { columnStats } from './episodes';
import type { EpisodeStats } from './lerobotRows';
import { aggregateStats } from './lerobotStats';

const nest = (values: number[]) => values.map((value) => [[value]]);

function feature(values: number[], nested: boolean) {
  const stats = columnStats(values, 3);

  if (!nested) return { ...stats };

  return { ...stats, min: nest(stats.min), max: nest(stats.max), mean: nest(stats.mean), std: nest(stats.std) };
}

describe('dataset statistics aggregation', () => {
  it('matches pooled samples across unequal episodes for vector and image features without changing inputs', () => {
    for (let seed = 0; seed < 40; seed++) {
      const samples = Array.from({ length: 1 + (seed % 9) }, (_, episode) =>
        Array.from(
          { length: 3 * (1 + ((episode + seed) % 7)) },
          (_, index) => Math.sin(seed + episode * 3 + index) * 100,
        ),
      );
      const episodes: EpisodeStats[] = samples.map((values) => ({
        state: feature(values, false),
        image: feature(values, true),
      }));
      const before = structuredClone(episodes);
      const actual = aggregateStats(episodes);
      const expected = columnStats(samples.flat(), 3);

      for (const key of ['state', 'image']) {
        expect(actual[key].count).toEqual(expected.count);

        for (const bound of ['min', 'max'] as const)
          expect(actual[key][bound]).toEqual(key === 'image' ? nest(expected[bound]) : expected[bound]);

        for (const moment of ['mean', 'std'] as const) {
          const values = actual[key][moment].flat(2) as number[];

          values.forEach((value, col) => expect(value).toBeCloseTo(expected[moment][col], 10));
        }
      }

      expect(episodes).toEqual(before);
    }
  });

  it('preserves nonfinite extrema and signed zeros', () => {
    const make = (min: number[], max: number[]): EpisodeStats => ({
      state: { min, max, mean: [0, 0, 0], std: [1, 1, 1], count: [1] },
    });
    const actual = aggregateStats([make([0, Infinity, 1], [-0, -Infinity, 1]), make([-0, 2, NaN], [0, 2, NaN])]);

    expect(actual.state.min).toEqual([-0, 2, NaN]);
    expect(actual.state.max).toEqual([0, 2, NaN]);
  });

  it('keeps empty datasets and zero-width features empty', () => {
    expect(aggregateStats([])).toEqual({});
    expect(aggregateStats([{ state: { min: [], max: [], mean: [], std: [], count: [2] } }])).toEqual({
      state: { min: [], max: [], mean: [], std: [], count: [2] },
    });
  });
});
