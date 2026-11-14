import { describe, expect, it } from 'vitest';
import {
  canMark,
  mergeBack,
  moveEdge,
  patched,
  readTryLabels,
  renamed,
  shownVerdict,
  splitAt,
  withTags,
  type TrySegment,
} from './tryLabels';

const segments: TrySegment[] = [
  { start: 0, end: 50, label: 'reach the block' },
  { start: 50, end: 80, label: 'grasp the block' },
  { start: 80, end: 120, label: 'lift the block' },
];

describe('try labels', () => {
  it('splits at a frame, merges back and moves an edge, keeping the segments contiguous', () => {
    const split = splitAt(segments, 100);

    expect(split.map((s) => [s.start, s.end, s.label])).toEqual([
      [0, 50, 'reach the block'],
      [50, 80, 'grasp the block'],
      [80, 100, 'lift the block'],
      [100, 120, 'lift the block'],
    ]);
    expect(mergeBack(split, 3)).toEqual(segments);
    expect(mergeBack(segments, 1).map((s) => [s.start, s.end, s.label])).toEqual([
      [0, 80, 'reach the block'],
      [80, 120, 'lift the block'],
    ]);
    expect(moveEdge(segments, 1, 60).map((s) => [s.start, s.end])).toEqual([
      [0, 60],
      [60, 80],
      [80, 120],
    ]);
    expect(moveEdge(segments, 1, 500)[1]).toEqual({ ...segments[1], start: 79 });
    expect(splitAt(segments, 50)).toBe(segments);
    expect(mergeBack(segments, 0)).toBe(segments);
  });

  it('renames in place and refuses an empty name', () => {
    expect(renamed(segments, 2, ' lift it ')[2].label).toBe('lift it');
    expect(renamed(segments, 2, '  ')[2].label).toBe('lift the block');
  });

  it('marks only an unjudged try, and never overrides a contract verdict', () => {
    expect(canMark('unjudged', undefined)).toBe(true);
    expect(canMark('failed', undefined)).toBe(false);
    expect(canMark('passed', { mark: 'failed' })).toBe(false);
    expect(
      canMark('unjudged', { judged: { caseId: 'c', caseName: 'Touch a Point', verdict: 'passed', margin: 1 } }),
    ).toBe(false);
    expect(shownVerdict('passed', { mark: 'failed' })).toBe('passed');
    expect(shownVerdict('unjudged', { mark: 'failed' })).toBe('failed');
  });

  it('reads only well-formed labels, and patches keys away with null', () => {
    const read = readTryLabels({
      segments: [...segments, { start: 130, end: 140, label: 'gap' }],
      tags: ['  good  grip ', 'good grip', 3],
      mark: 'maybe',
      instruction: 'pick up the red block',
    });

    expect(read).toEqual({ tags: ['good grip'], instruction: 'pick up the red block' });
    expect(patched({ tags: ['a'], mark: 'passed' }, { mark: null, segments })).toEqual({ segments, tags: ['a'] });
    expect(withTags(['a'], ['b', 'a', ' '])).toEqual(['a', 'b']);
  });
});
