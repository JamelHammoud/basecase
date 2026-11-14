import { describe, expect, it } from 'vitest';
import type { TrySummary } from './tryFile';
import { markChanges, markable, summaryVerdict, tagChanges } from './tryRelabels';

const summary = (id: string, more: Partial<TrySummary> = {}) =>
  ({
    id,
    outcome: { verdict: 'unjudged', margin: null },
    tags: [],
    mark: null,
    judged: null,
    ...more,
  }) as TrySummary;

describe('try relabels', () => {
  it('marks only tries no Case judged', () => {
    const open = summary('a');
    const passed = summary('b', { outcome: { verdict: 'passed', margin: 1 } });
    const judged = summary('c', { judged: 'failed' });

    expect(markable(open)).toBe(true);
    expect(markable(passed)).toBe(false);
    expect(markable(judged)).toBe(false);
    expect(markChanges([open], ['a'], 'passed')).toEqual([{ id: 'a', patch: { mark: 'passed' } }]);
    expect(markChanges([open, passed], ['a', 'b'], 'failed')).toEqual([]);
    expect(markChanges([judged], ['c'], 'passed')).toEqual([]);
  });

  it('shows a Case verdict over a judged one over a mark', () => {
    expect(summaryVerdict(summary('a', { mark: 'failed' }))).toBe('failed');
    expect(summaryVerdict(summary('a', { mark: 'failed', judged: 'passed' }))).toBe('passed');
    expect(summaryVerdict(summary('a', { outcome: { verdict: 'failed', margin: 0 }, mark: 'passed' }))).toBe('failed');
    expect(summaryVerdict(summary('a'))).toBe('unjudged');
  });

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
