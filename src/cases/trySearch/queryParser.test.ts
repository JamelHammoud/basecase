import { describe, expect, it } from 'vitest';
import { hasFacts, parseQuery } from './queryParser';
import type { QueryFilters } from './types';

const vocab = { robots: ['SO-101 Arm', 'Hexapod', 'Arm', 'G1 Humanoid'], inputs: ['leader-arm', 'gamepad'] };
const NOW = new Date(2026, 10, 14, 15, 30);
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

const parse = (text: string) => parseQuery(text, vocab, NOW);

const facts = (text: string): Partial<QueryFilters> => {
  const { filters } = parse(text);

  return Object.fromEntries(
    Object.entries(filters).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== null)),
  ) as Partial<QueryFilters>;
};

describe('reading a search', () => {
  it.each([
    ['failed grasp red block leader-arm', ['grasp', 'red', 'block'], { verdicts: ['failed'], inputs: ['leader-arm'] }],
    [
      'failed grasps on the red block from the leader arm',
      ['grasps', 'red', 'block'],
      { verdicts: ['failed'], inputs: ['leader-arm'] },
    ],
    ['walk hexapod over 30 s', ['walk'], { robots: ['Hexapod'], minSeconds: 30 }],
    ['Missed SO-101 arm', [], { verdicts: ['failed'], robots: ['SO-101 Arm'] }],
    ['so 101 arm passed', [], { verdicts: ['passed'], robots: ['SO-101 Arm'] }],
    ['arm unjudged', [], { verdicts: ['unjudged'], robots: ['Arm'] }],
    ['pass or fail', [], { verdicts: ['passed', 'failed'] }],
    ['variations real', [], { sources: ['generated', 'real'] }],
    ['gamepad keys', [], { inputs: ['gamepad', 'keys'] }],
    ['faulted walk', ['walk'], { faulted: true }],
    ['under 2 min', [], { maxSeconds: 120 }],
    ['longer than 10s', [], { minSeconds: 10 }],
    ['shorter than 1 m', [], { maxSeconds: 60 }],
    ['at least 1.5 minutes', [], { minSeconds: 90 }],
    ['over 1 hour', [], { minSeconds: 3600 }],
    ['pick up the cup slowly', ['pick', 'up', 'cup', 'slowly'], {}],
  ])('%s', (text, words, expected) => {
    expect(parse(text).words).toEqual(words);
    expect(facts(text)).toEqual(expected);
  });

  it.each([
    ['today', at(2026, 11, 14), at(2026, 11, 15)],
    ['yesterday', at(2026, 11, 13), at(2026, 11, 14)],
    ['this week', at(2026, 11, 9), at(2026, 11, 16)],
    ['last week', at(2026, 11, 2), at(2026, 11, 9)],
    ['this month', at(2026, 11, 1), at(2026, 12, 1)],
    ['last month', at(2026, 10, 1), at(2026, 11, 1)],
    ['last 3 days', at(2026, 11, 12), at(2026, 11, 15)],
  ])('reads “%s” as a date span in local time, weeks from Monday', (text, after, before) => {
    expect(facts(text)).toEqual({ after, before });
    expect(parse(text).words).toEqual([]);
  });

  it('reads last week across a new year', () => {
    const { filters } = parseQuery('last week', vocab, new Date(2027, 0, 2, 9));

    expect([filters.after, filters.before]).toEqual([at(2026, 12, 21), at(2026, 12, 28)]);
  });

  it('reads like: as More Like This, keeping the id’s case', () => {
    expect(parse('like:Try-Ab12 passed').filters.like).toEqual({ tryId: 'Try-Ab12', segmentId: null });
    expect(parse('grasp like:try-1/seg-2').filters.like).toEqual({ tryId: 'try-1', segmentId: 'seg-2' });
    expect(parse('grasp like:try-1/seg-2').words).toEqual(['grasp']);
    expect(parse('unlike:x').filters.like).toBeNull();
  });

  it('matches robot names whole, never inside another word', () => {
    expect(facts('armchair')).toEqual({});
    expect(parse('armchair').words).toEqual(['armchair']);
  });

  it('knows when a search has facts', () => {
    expect(hasFacts(parse('red block').filters)).toBe(false);
    expect(hasFacts(parse('red block today').filters)).toBe(true);
    expect(parse('   ')).toEqual({ words: [], filters: parse('').filters });
  });
});
