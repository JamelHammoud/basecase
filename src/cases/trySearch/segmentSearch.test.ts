import { describe, expect, it } from 'vitest';
import { storedTry, graspMotion } from './fixtures/searchFixtures';
import { parseQuery } from './queryParser';
import { TrySearchIndex } from './searchIndex';
import { distinctTries } from './hitSelection';

const labelled = () => ({
  ...storedTry({ id: 'labelled', caseName: 'Sort Parts', input: null, motion: graspMotion() }),
  labels: {
    segments: [
      { from: 0, to: 40, label: 'grasp bolt', instruction: 'grab the silver bolt', tags: ['fragile'] },
      { from: 40, to: 90, label: 'place bolt' },
      { from: 90, to: 120, label: 'grasp bolt', instruction: 'grab the silver bolt' },
    ],
    by: 'agent' as const,
    tags: ['night shift'],
    flags: [],
  },
});

const build = () => {
  const index = new TrySearchIndex();

  index.put([labelled()]);

  return index;
};

const search = (index: TrySearchIndex, text: string) =>
  index.search(parseQuery(text, index.vocab(), new Date(2026, 10, 14)), 50);
const ranges = (index: TrySearchIndex, text: string) =>
  search(index, text)
    .map(({ tryId, from, to }) => ({ tryId, from, to }))
    .sort((a, b) => (a.from ?? 0) - (b.from ?? 0));

describe('searching exact labelled segments', () => {
  it('keeps repeated matches as separate frame ranges and applies try facts', () => {
    expect(ranges(build(), 'silver bolt')).toEqual([
      { tryId: 'labelled', from: 0, to: 40 },
      { tryId: 'labelled', from: 90, to: 120 },
    ]);
    expect(search(build(), 'failed silver bolt')).toEqual([]);
    expect(ranges(build(), 'passed fragile')).toEqual([{ tryId: 'labelled', from: 0, to: 40 }]);
  });

  it('combines shared metadata with one segment without joining words from different segments', () => {
    expect(ranges(build(), 'night silver')).toHaveLength(2);
    expect(search(build(), 'silver place')).toEqual([]);
    expect(ranges(build(), 'night shift')).toEqual([{ tryId: 'labelled', from: undefined, to: undefined }]);
    expect(ranges(build(), 'passed')).toEqual([{ tryId: 'labelled', from: undefined, to: undefined }]);
  });

  it('restores exact matches from the snapshot and replaces changed labels', () => {
    const index = build();
    const restored = TrySearchIndex.fromSnapshot(index.snapshot())!;

    expect(search(restored, 'silver')).toEqual(search(index, 'silver'));
    index.put([{ ...labelled(), labels: { ...labelled().labels, segments: [] } }]);
    expect(search(index, 'silver')).toEqual([]);
  });

  it('prefers matching segments even when their words also occur in the Case title', () => {
    const index = build();

    index.put([{ ...labelled(), case: { id: 'case', name: 'Grasp Bolt', hash: 'c' } }]);
    expect(ranges(index, 'grasp')).toEqual([
      { tryId: 'labelled', from: 0, to: 40 },
      { tryId: 'labelled', from: 90, to: 120 },
    ]);
    expect(distinctTries(search(index, 'grasp'))).toHaveLength(1);
  });

  it('retains matching ranges when motion similarity also narrows by words', () => {
    const index = build();

    index.put([storedTry({ id: 'reference', motion: graspMotion() })]);
    expect(ranges(index, 'like:reference silver')).toEqual([
      { tryId: 'labelled', from: 0, to: 40 },
      { tryId: 'labelled', from: 90, to: 120 },
    ]);
  });

  it('keeps segment matches when a parser alternate also matches the whole try', () => {
    const index = build();
    const query = parseQuery('night', index.vocab(), new Date(2026, 10, 14));

    query.alternate = parseQuery('silver', index.vocab(), new Date(2026, 10, 14));

    const hits = index.search(query, 50);

    expect(hits).toHaveLength(2);
    expect(hits.every((hit) => hit.from !== undefined && hit.to !== undefined)).toBe(true);
  });
});
