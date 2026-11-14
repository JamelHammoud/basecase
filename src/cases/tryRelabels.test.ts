import { describe, expect, it } from 'vitest';
import type { TrySummary } from './tryFile';
import { tagChanges } from './tryRelabels';

const summary = (id: string, more: Partial<TrySummary> = {}) =>
  ({
    id,
    tags: [],
    ...more,
  }) as TrySummary;

describe('try relabels', () => {
  it('adds one tag to every chosen try in one change list', () => {
    const tries = [summary('a', { tags: ['left'] }), summary('b'), summary('c')];

    expect(tagChanges(tries, ['a', 'b'], '  slow   grip ')).toEqual([
      { id: 'a', patch: { tags: ['left', 'slow grip'] } },
      { id: 'b', patch: { tags: ['slow grip'] } },
    ]);
    expect(tagChanges(tries, ['a'], 'left')).toEqual([{ id: 'a', patch: { tags: ['left'] } }]);
    expect(tagChanges(tries, ['a'], '   ')).toEqual([]);
  });
});
