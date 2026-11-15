import { describe, expect, it } from 'vitest';
import { graspMotion, storedTry, waveMotion } from './fixtures/searchFixtures';
import { parseQuery } from './queryParser';
import { TrySearchIndex } from './searchIndex';

const NOW = new Date(2026, 10, 14, 15);
const QUERIES = ['bolt', 'silver', 'passed', 'failed', 'like:reference', 'like:reference bolt', 'walk the mat'];

function corpus() {
  return Array.from({ length: 240 }, (_, i) => ({
    ...storedTry({
      id: `try-${i}`,
      caseName: i % 3 ? 'Walk the Mat with a Bolt' : 'Walk the Ramp',
      input: i % 2 ? 'keys' : 'mat',
      task: i % 4 ? 'grasp the bolt' : 'place the silver bolt',
      startedAt: new Date(Date.UTC(2026, 10, 14, i % 12)).toISOString(),
      verdict: i % 5 ? 'passed' : 'failed',
      motion: i % 3 ? graspMotion(1, (i % 7) / 100) : waveMotion(),
    }),
    labels: {
      segments: [
        { from: 0, to: 30, label: 'grasp silver bolt' },
        { from: 60, to: 90, label: i % 2 ? 'place bolt' : 'grasp silver bolt' },
      ],
      by: 'agent' as const,
      tags: [],
      flags: [],
    },
  }));
}

function checkLimits(index: TrySearchIndex) {
  for (const text of QUERIES) {
    const query = parseQuery(text, index.vocab(), NOW);
    const all = index.search(query, Infinity);

    expect(all.length, text).toBeGreaterThan(20);

    for (const limit of [0, 1, 3, 20, 200, 1000]) {
      expect(index.search(query, limit), `${text}, ${limit}`).toEqual(all.slice(0, limit));
    }
  }
}

describe('ranking every try search path', () => {
  it('preserves complete result order, ranges and scores through limits, snapshots and edits', () => {
    const index = new TrySearchIndex();
    const tries = corpus();

    index.put([storedTry({ id: 'reference', motion: graspMotion() }), ...tries]);
    checkLimits(index);

    const restored = TrySearchIndex.fromSnapshot(index.snapshot())!;

    checkLimits(restored);
    index.remove(tries.slice(0, 20).map((entry) => entry.id));
    index.put([{ ...tries[239], startedAt: '2026-11-15T00:00:00.000Z' }]);
    checkLimits(index);
    expect(index.search(parseQuery('passed', index.vocab(), NOW), 1)[0].tryId).toBe('try-239');
  });
});
