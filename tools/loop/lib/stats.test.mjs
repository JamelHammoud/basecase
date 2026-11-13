import { describe, expect, it } from 'vitest';
import { countByKind, digestTable, digestTitle, median, redHours, weekStats } from './stats.mjs';

const FROM = '2026-11-05T00:00:00Z';
const TO = '2026-11-12T00:00:00Z';

const run = (conclusion, updatedAt, status = 'completed') => ({ conclusion, status, updatedAt });

describe('median', () => {
  it.each([
    [[], null],
    [[5], 5],
    [[3, 1, 2], 2],
    [[4, 1, 3, 2], 2.5],
  ])('of %j is %s', (values, expected) => {
    expect(median(values)).toBe(expected);
  });
});

describe('redHours', () => {
  it('adds up each red stretch inside the week', () => {
    const runs = [
      run('failure', '2026-11-06T00:00:00Z'),
      run('failure', '2026-11-06T01:00:00Z'),
      run('success', '2026-11-06T03:00:00Z'),
      run('failure', '2026-11-11T22:00:00Z'),
    ];

    expect(redHours(runs, { from: FROM, to: TO })).toBe(5);
  });

  it('carries red in from before the week and ignores cancelled and running runs', () => {
    const runs = [
      run('failure', '2026-11-04T12:00:00Z'),
      run('cancelled', '2026-11-05T01:00:00Z'),
      run('', '2026-11-05T01:30:00Z', 'in_progress'),
      run('success', '2026-11-05T02:00:00Z'),
    ];

    expect(redHours(runs, { from: FROM, to: TO })).toBe(2);
  });

  it('is zero for a green week', () => {
    expect(redHours([run('success', '2026-11-04T00:00:00Z')], { from: FROM, to: TO })).toBe(0);
  });
});

describe('weekStats', () => {
  const pull = (number, label, createdAt, mergedAt) => ({
    number,
    labels: label ? [{ name: label }] : [],
    createdAt,
    mergedAt,
  });
  const pulls = [
    pull(1, 'loop:feature', '2026-11-06T00:00:00Z', '2026-11-06T02:00:00Z'),
    pull(2, 'loop:feature', '2026-11-06T00:00:00Z', '2026-11-06T06:00:00Z'),
    pull(3, 'loop:lesson', '2026-11-07T00:00:00Z', '2026-11-07T04:00:00Z'),
    pull(4, 'loop:repair', '2026-11-08T00:00:00Z', null),
    pull(5, 'loop:refine', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'),
  ];
  const comments = [
    { body: '### Review: pass (aaaaaaa)\nGood.', createdAt: '2026-11-06T00:00:00Z' },
    {
      body: '### Review: changes needed (bbbbbbb)\nNo.\n\n- **blocker** `a`: x Fix: y',
      createdAt: '2026-11-06T00:00:00Z',
    },
    {
      body: '### Review: changes needed (ccccccc)\nOld.\n\n- **blocker** `a`: x Fix: y',
      createdAt: '2026-10-01T00:00:00Z',
    },
    { body: 'Ship it.', createdAt: '2026-11-06T00:00:00Z' },
  ];
  const stats = weekStats({
    pulls,
    comments,
    commits: [{ message: 'Revert "Add x"' }, { message: 'Add y' }],
    runs: [],
    openSteps: 4,
    from: FROM,
    to: TO,
  });

  it('counts merges by kind inside the week, with lessons on their own', () => {
    expect(stats.merged).toBe(3);
    expect(stats.byKind).toEqual([['feature', 2]]);
    expect(stats.lessons).toBe(1);
    expect(stats.mergeHours).toBe(4);
  });

  it('counts verdicts and blockers from the week’s reviews', () => {
    expect(stats.reviews).toEqual({ passed: 1, failed: 1, blockers: 1, minors: 0 });
    expect(stats.reverts).toBe(1);
  });

  it('writes a table and a dated title', () => {
    const table = digestTable(stats);

    expect(digestTitle(FROM)).toBe('Digest: week of 2026-11-05');
    expect(table.split('\n').slice(0, 2)).toEqual(['| Measure | Week |', '|---|---:|']);
    expect(table).toContain('| Merged: `loop:feature` | 2 |');
    expect(table).toContain("| Hours `main`'s Check was red | 0.0 |");
    expect(table).toContain('| Median hours from opened to merged | 4.0 |');
  });

  it('sorts kinds by count, then name', () => {
    expect(countByKind([pull(1, 'loop:refine'), pull(2, 'loop:fix'), pull(3, 'loop:refine'), pull(4)])).toEqual([
      ['refine', 2],
      ['fix', 1],
      ['other', 1],
    ]);
  });
});
