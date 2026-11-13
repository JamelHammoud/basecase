import { describe, expect, it } from 'vitest';
import { categoryRates, pickWeakness, recentCategories, runsOf, shortfall, weaknessMarkdown } from './weakness.mjs';

const entry = (task, grade, extra = {}) => ({ task, grade, run: 'r1', seed: 1, heldOut: false, ...extra });

const categoryOf = { A1: 'assembly', A2: 'assembly', S1: 'service', C1: 'cost' };

const entries = [
  entry('A1', 'pass'),
  entry('A1', 'fail'),
  entry('A2', 'pass'),
  entry('A2', 'pass'),
  entry('S1', 'fail'),
  entry('S1', 'pass'),
  entry('S1', 'error'),
  entry('C1', 'pass'),
  entry('C1', 'pass'),
];

describe('categoryRates', () => {
  it('averages pass rates per task, ignoring errors, worst task first', () => {
    const assembly = categoryRates(entries, categoryOf).find((c) => c.category === 'assembly');

    expect(assembly.rate).toBe(0.75);
    expect(assembly.failures).toBe(1);
    expect(assembly.tasks.map((t) => t.task)).toEqual(['A1', 'A2']);
  });

  it('never counts held-out runs or tasks with no tune category', () => {
    const rows = categoryRates(
      [entry('A1', 'fail', { heldOut: true }), entry('A9', 'fail'), entry('A1', 'pass')],
      categoryOf,
    );

    expect(rows).toEqual([expect.objectContaining({ category: 'assembly', rate: 1, failures: 0 })]);
  });
});

describe('pickWeakness', () => {
  it('picks the category with the lowest pass rate', () => {
    expect(pickWeakness({ entries, categoryOf }).category).toBe('service');
  });

  it('skips a category tried recently while another still fails', () => {
    expect(pickWeakness({ entries, categoryOf, recent: ['service'] }).category).toBe('assembly');
  });

  it('comes back to a recent category when nothing else fails', () => {
    expect(pickWeakness({ entries, categoryOf, recent: ['service', 'assembly'] }).category).toBe('service');
  });

  it('breaks a tie in rate by the number of failed runs', () => {
    const half = [
      entry('A1', 'fail'),
      entry('A1', 'pass'),
      ...['fail', 'fail', 'pass', 'pass'].map((g) => entry('S1', g)),
    ];

    expect(pickWeakness({ entries: half, categoryOf }).category).toBe('service');
  });

  it('finds nothing when every run passes', () => {
    expect(pickWeakness({ entries: [entry('A1', 'pass')], categoryOf })).toBeNull();
  });
});

describe('recentCategories', () => {
  const now = Date.parse('2026-11-13T12:00:00Z');

  it('lists categories tried within the window, once each', () => {
    const tried = [
      { category: 'cost', at: '2026-11-13T00:00:00Z' },
      { category: 'cost', at: '2026-11-12T00:00:00Z' },
      { category: 'craft', at: '2026-11-01T00:00:00Z' },
    ];

    expect(recentCategories(tried, { now })).toEqual(['cost']);
  });
});

describe('shortfall', () => {
  it('lists the tasks short of the seeds and how many more each needs at most', () => {
    const byTask = new Map([
      ['A1', [1, 2, 3]],
      ['A2', [1]],
    ]);

    expect(shortfall(byTask, ['A1', 'A2', 'S1'], 3)).toEqual({ tasks: ['A2', 'S1'], seeds: 3 });
    expect(shortfall(byTask, ['A1'], 3)).toEqual({ tasks: [], seeds: 0 });
  });
});

describe('runsOf', () => {
  it('names each run once', () => {
    const byTask = new Map([
      ['A1', [entry('A1', 'pass', { run: 'b' }), entry('A1', 'pass', { run: 'a' })]],
      ['A2', [entry('A2', 'pass', { run: 'b' })]],
    ]);

    expect(runsOf(byTask)).toEqual(['a', 'b']);
  });
});

describe('weaknessMarkdown', () => {
  it('states the category, its rate and each task', () => {
    const weakness = pickWeakness({ entries, categoryOf });
    const text = weaknessMarkdown(weakness, {
      titleOf: { S1: 'Replaceable battery' },
      settings: { served: 'claude-opus-5-5', effort: 'high' },
      harness: 'abc',
    });

    expect(text).toContain('**service**');
    expect(text).toContain('50% of runs pass');
    expect(text).toContain('- S1 “Replaceable battery”: 1 of 2 runs pass');
  });
});
