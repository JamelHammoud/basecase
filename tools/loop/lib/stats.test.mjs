import { describe, expect, it } from 'vitest';
import { withMark } from './mark.mjs';
import { laneOf, worstChange } from './laneStats.mjs';
import {
  countByKind,
  digestBody,
  digestTable,
  digestTitle,
  median,
  parseDigest,
  redHours,
  weekStats,
  worstLine,
} from './stats.mjs';

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
    title: `Pull ${number}`,
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
  const OWNER = 'JamelHammoud';
  const review = (body, createdAt, author = OWNER) => ({ author, body: withMark(body), createdAt });
  const blocked = (sha) => `### Review: changes needed (${sha})\nNo.\n\n- **blocker** \`a\`: x Fix: y`;
  const comments = [
    review('### Review: pass (aaaaaaa)\nGood.', '2026-11-06T00:00:00Z'),
    review(blocked('bbbbbbb'), '2026-11-06T00:00:00Z'),
    review(blocked('ccccccc'), '2026-10-01T00:00:00Z'),
    review(blocked('ddddddd'), '2026-11-06T00:00:00Z', 'outsider'),
    { author: OWNER, body: blocked('eeeeeee'), createdAt: '2026-11-06T00:00:00Z' },
    { author: OWNER, body: 'Ship it.', createdAt: '2026-11-06T00:00:00Z' },
    {
      ...review(
        '### Micro-evals: no worse (aaaaaaa)\n\nGap +3.\n\n<!-- micro-evals {"sha":"aaaaaaa","verdict":"no worse","gap":0.03,"ci":[-0.02,0.08],"costRise":0.05} -->',
        '2026-11-06T00:00:00Z',
      ),
      number: 2,
    },
    {
      ...review(
        '### Micro-evals: not measured (bbbbbbb)\n\nNot measured: usage is paused.\n\n<!-- micro-evals {"sha":"bbbbbbb","verdict":"skipped","skip":"pause"} -->',
        '2026-11-07T00:00:00Z',
      ),
      number: 3,
    },
  ];
  const stats = weekStats({
    pulls,
    comments,
    commits: [{ message: 'Revert "Add x"' }, { message: 'Add y' }],
    runs: [],
    openSteps: 4,
    owner: OWNER,
    from: FROM,
    to: TO,
  });

  it('counts merges by kind inside the week, with lessons on their own', () => {
    expect(stats.merged).toBe(3);
    expect(stats.byKind).toEqual([['feature', 2]]);
    expect(stats.lessons).toBe(1);
    expect(stats.mergeHours).toBe(4);
  });

  it('counts verdicts and blockers from the loop’s own reviews in the week', () => {
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

  it('lists the merged pull requests the review measured on the micro-evals, with their delta, and not the skipped', () => {
    expect(stats.harness).toEqual([
      { number: 2, title: 'Pull 2', delta: 'no worse: +3 points (95% interval −2 to +8), cost per pass +5%' },
    ]);
    expect(digestBody(stats)).toContain('- #2 Pull 2: no worse: +3 points (95% interval −2 to +8), cost per pass +5%');
  });

  it('sorts kinds by count, then name', () => {
    expect(countByKind([pull(1, 'loop:refine'), pull(2, 'loop:fix'), pull(3, 'loop:refine'), pull(4)])).toEqual([
      ['refine', 2],
      ['fix', 1],
      ['other', 1],
    ]);
  });
});

describe('per-lane numbers', () => {
  const OWNER = 'JamelHammoud';
  const at = (day, hour = 0) => `2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`;
  const pull = (number, branch, { body = '', createdAt, mergedAt = null }) => ({
    number,
    headRefName: branch,
    labels: [],
    body,
    createdAt,
    mergedAt,
  });
  const pulls = [
    pull(10, 'loop/build/7-a-20261106', { body: 'Closes #7.', createdAt: at(6), mergedAt: at(6, 10) }),
    pull(11, 'loop/build/8-b-20261106', { body: 'Closes #8.', createdAt: at(6), mergedAt: at(6, 2) }),
    pull(12, 'loop/build/c-20261107', { createdAt: at(7), mergedAt: at(7, 4) }),
    pull(20, 'loop/refine/fit-20261106', { createdAt: at(6), mergedAt: at(6, 6) }),
    pull(30, 'loop/batch/20261106', {
      body: 'Merges 2.\n\n- #10 Feature: a\n- #20 Refine: b\n',
      createdAt: at(6, 11),
      mergedAt: at(6, 12),
    }),
    pull(40, 'loop/repair/main-abc1234-20261107', { createdAt: at(7), mergedAt: at(7, 3) }),
    pull(41, 'loop/repair/main-def5678-20261108', { createdAt: at(8) }),
    pull(42, 'loop/repair/main-9999999-20261108', { createdAt: at(8) }),
    pull(50, 'loop/learn/lessons-20261001', { createdAt: '2026-10-01T00:00:00Z', mergedAt: '2026-10-01T05:00:00Z' }),
  ];
  const commits = [
    {
      sha: 'abc1234aaaa',
      message: 'Merge pull request #30 from JamelHammoud/loop/batch/20261106\n\nBatch',
      date: at(6, 12),
    },
    { sha: 'def5678bbbb', message: 'Fix: the thing (#11)', date: at(6, 2) },
  ];
  const review = (number, verdict, createdAt, copy = '') => ({
    number,
    author: OWNER,
    createdAt,
    body: withMark(`### Review: ${verdict} (aaaaaaa)\nNotes.${copy ? `\n\n\`\`\`\n${copy}\n\`\`\`` : ''}`),
  });
  const comments = [
    review(10, 'changes needed', at(6, 1)),
    review(10, 'changes needed', at(6, 3)),
    review(10, 'pass', at(6, 5), 'Copy: 1 added, 0 changed, 0 removed, net +1'),
    review(10, 'changes needed', at(6, 7)),
    review(11, 'pass', at(6, 1), 'Copy: 0 added, 0 changed, 2 removed, net -2'),
    review(20, 'changes needed', at(6, 2)),
    review(20, 'pass', at(6, 4)),
  ];
  const issue = (number, labels, createdAt, closed = {}) => ({
    number,
    labels: labels.map((name) => ({ name })),
    createdAt,
    closedAt: closed.at ?? null,
    stateReason: closed.reason ?? null,
  });
  const steps = [
    issue(7, ['loop:building', 'loop:feature'], at(5), { at: at(6, 10), reason: 'COMPLETED' }),
    issue(8, ['loop:building', 'loop:refine'], at(6), { at: at(6, 2), reason: 'COMPLETED' }),
    issue(9, ['loop:next', 'loop:feature'], at(8)),
    issue(60, ['loop:next', 'loop:integration'], at(9), { at: at(9, 5), reason: 'NOT_PLANNED' }),
    issue(70, ['loop:arc'], at(6)),
  ];
  const week = (previous = null) =>
    weekStats({ pulls, comments, commits, runs: [], steps, openSteps: 1, owner: OWNER, from: FROM, to: TO, previous });

  it('groups merged pull requests by the lane that opened them, leaving batches out', () => {
    expect(Object.keys(week().lanes)).toEqual(['build', 'refine', 'repair', 'lead']);
    expect(laneOf({ headRefName: 'feature/x', labels: [{ name: 'loop:fix' }] })).toBe('fix');
  });

  it('takes the median hours from the step issue, or the pull request when there is none', () => {
    expect(week().lanes.build.mergeHours).toBe(4);
    expect(week().lanes.refine.mergeHours).toBe(6);
  });

  it('counts review rounds before the first pass', () => {
    expect(week().lanes.build.revisions).toBeCloseTo(0.67, 2);
    expect(week().lanes.refine.revisions).toBe(1);
  });

  it('traces each repair to the merge that broke main, sharing a batch among its members', () => {
    expect(week().lanes.build.repairs).toBe(0.5);
    expect(week().lanes.refine.repairs).toBe(0.5);
    expect(week().lanes.repair.repairs).toBe(0);
  });

  it('sums the copy net from the review records, and shows none when nothing was counted', () => {
    expect(week().lanes.build.copyNet).toBe(-1);
    expect(week().lanes.refine.copyNet).toBeNull();
  });

  it('scores steps closed against steps opened on the lead, which opens them', () => {
    expect(week().lanes.lead).toEqual({ steps: 0.5, stepsOpened: 4, stepsClosed: 2 });
  });

  it('shows only this week on the first digest', () => {
    const body = digestBody(week());

    expect(body).toContain('| Lane | Measure | This week |\n|---|---|---:|');
    expect(body).not.toContain('Last week');
    expect(body).not.toContain('Worst change');
    expect(body).toContain('| `build` | Review rounds before pass, per pull request | 0.67 |');
  });

  it('reads last week back from the stored block and shows the change', () => {
    const first = week();
    const stored = parseDigest(`Some text\n\n${digestBody(first)}`);

    expect(stored).toEqual({ from: FROM, to: TO, lanes: first.lanes, worst: null });
    expect(parseDigest('No block here')).toBeNull();

    const worse = { ...stored.lanes, build: { ...stored.lanes.build, revisions: 0.33 } };
    const next = week({ ...stored, lanes: worse });
    const body = digestBody(next);

    expect(body).toContain('| Lane | Measure | This week | Last week | Change |');
    expect(body).toContain('| `build` | Review rounds before pass, per pull request | 0.67 | 0.33 | +0.34 |');
    expect(next.worst).toMatchObject({ lane: 'build', measure: 'revisions', last: 0.33, value: 0.67 });
    expect(body).toContain(worstLine(next.worst));
    expect(parseDigest(body).worst).toEqual(next.worst);
  });
});

describe('worstChange', () => {
  it('picks the number that got worst against its last value, either direction', () => {
    const worst = worstChange(
      { build: { mergeHours: 6, copyNet: 3 }, lead: { steps: 0.5 } },
      { build: { mergeHours: 4, copyNet: 0 }, lead: { steps: 1 } },
    );

    expect(worst).toMatchObject({ lane: 'build', measure: 'copyNet', last: 0, value: 3, score: 3 });
  });

  it('breaks a tie by lane order, then measure order', () => {
    const now = { refine: { revisions: 2 }, build: { revisions: 2, mergeHours: 2 } };
    const last = { refine: { revisions: 1 }, build: { revisions: 1, mergeHours: 1 } };

    expect(worstChange(now, last)).toMatchObject({ lane: 'build', measure: 'mergeHours' });
  });

  it('names nothing when no number got worse or there is no last week', () => {
    expect(worstChange({ build: { revisions: 1 } }, { build: { revisions: 2 } })).toBeNull();
    expect(worstChange({ build: { revisions: 1 } }, null)).toBeNull();
  });
});
