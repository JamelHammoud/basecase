import { describe, expect, it } from 'vitest';
import { newestFirst, rankedHits } from './rankedHits';
import type { TryHit } from './types';

const byScore = (a: TryHit, b: TryHit) => b.score - a.score || newestFirst(a, b);

function corpus(count: number, seed: number): TryHit[] {
  let state = seed;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state;
  };

  return Array.from({ length: count }, (_, i) => ({
    tryId: `try-${i % 17}`,
    from: i * 10,
    to: i * 10 + 5,
    label: 'Grasp Bolt',
    robot: 'SO-101 Arm',
    sceneId: `scene-${i % 3}`,
    score: (next() % 31) / 31,
    match: 'words',
    verdict: 'passed',
    seconds: 12,
    startedAt: new Date(Date.UTC(2026, 10, 14, 0, 0, next() % 7)).toISOString(),
  }));
}

describe('bounded try ranking', () => {
  it('matches stable sorting across tied scores, dates, ranges and slice boundaries', () => {
    const limits = [-Infinity, -999, -23.9, -1, -0.5, 0, 0.5, 1, 3.9, 20, 200, 999, Infinity, NaN];

    for (let seed = 1; seed <= 80; seed++) {
      const hits = corpus((seed * 73) % 401, seed);

      for (const compare of [byScore, newestFirst]) {
        const sorted = [...hits].sort(compare);

        for (const limit of limits) {
          expect(rankedHits([...hits], limit, compare)).toEqual(sorted.slice(0, limit));
        }
      }
    }
  });

  it('keeps the first exact ties through heap replacement and repeated calls', () => {
    const hits = corpus(300, 9).map((hit, i) => ({ ...hit, score: i < 15 ? 0 : 1, startedAt: '2026-11-14' }));
    const original = structuredClone(hits);

    expect(rankedHits(hits, 20)).toEqual(hits.slice(15, 35));
    expect(rankedHits(hits, 1)).toEqual([hits[15]]);
    expect(hits).toEqual(original);
    hits[299].score = 2;
    expect(rankedHits(hits, 1)).toEqual([hits[299]]);
    expect(rankedHits([], 20)).toEqual([]);
  });

  it.each([
    { count: 3000, limit: 20, budget: 2, fraction: 1 / 3 },
    { count: 6000, limit: 20, budget: 2, fraction: 1 / 3 },
    { count: 3000, limit: 200, budget: 5, fraction: 0.75 },
    { count: 6000, limit: 200, budget: 5, fraction: 0.75 },
  ])('bounds comparisons when taking $limit of $count hits', ({ count, limit, budget, fraction }) => {
    const hits = corpus(count, 73);
    let sortedComparisons = 0;
    let boundedComparisons = 0;
    const expected = [...hits].sort((a, b) => {
      sortedComparisons++;

      return byScore(a, b);
    });
    const actual = rankedHits(hits, limit, (a, b) => {
      boundedComparisons++;

      return byScore(a, b);
    });

    expect(actual).toEqual(expected.slice(0, limit));
    expect(boundedComparisons).toBeLessThan(count * budget);
    expect(boundedComparisons).toBeLessThan(sortedComparisons * fraction);
  });
});
