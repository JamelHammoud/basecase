import { describe, expect, it } from 'vitest';
import { withMark } from './mark.mjs';
import {
  blockerFindings,
  blockerType,
  blockerTypes,
  checkRuns,
  closedUnmerged,
  declinesByStep,
  jobWaits,
  mergeTimesByKind,
  nearDuplicates,
  percentile,
  queueTimes,
  verdicts,
  waitingSteps,
} from './retro.mjs';

const OWNER = 'JamelHammoud';
const NOW = Date.parse('2026-11-13T09:00:00Z');

const job = (created, started, conclusion = 'success') => ({
  name: 'unit',
  conclusion,
  created_at: `2026-11-13T08:${created}:00Z`,
  started_at: `2026-11-13T08:${started}:00Z`,
});

describe('jobWaits', () => {
  it('measures each job from created to started in minutes and leaves out skipped jobs', () => {
    expect(jobWaits([job('00', '05'), job('00', '12'), job('00', '00', 'skipped')])).toEqual([5, 12]);
  });
});

describe('queueTimes', () => {
  it('summarises the wait for a run’s first job, for any job, and for runs still queued', () => {
    const queue = queueTimes({
      sampled: [
        { jobs: [job('00', '02'), job('00', '10')] },
        { jobs: [job('00', '04'), job('00', '06')] },
        { jobs: [] },
      ],
      queued: [{ createdAt: '2026-11-13T08:30:00Z' }, { createdAt: '2026-11-13T08:50:00Z' }],
      now: NOW,
    });

    expect(queue.firstJob).toEqual({ count: 2, median: 3, p90: 4, max: 4 });
    expect(queue.anyJob).toEqual({ count: 4, median: 5, p90: 10, max: 10 });
    expect(queue).toMatchObject({ waitingNow: 2, oldestWaitingMinutes: 30 });
  });

  it('reports nothing waiting when the queue is empty', () => {
    expect(queueTimes({ sampled: [], queued: [], now: NOW })).toMatchObject({
      firstJob: { count: 0, median: null },
      waitingNow: 0,
      oldestWaitingMinutes: null,
    });
  });
});

describe('percentile', () => {
  it.each([
    [[], 0.9, null],
    [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9, 9],
    [[7], 0.5, 7],
  ])('of %j at %s is %s', (values, share, expected) => {
    expect(percentile(values, share)).toBe(expected);
  });
});

describe('checkRuns', () => {
  it('counts Check runs by event and outcome, naming unfinished ones by status', () => {
    const runs = [
      { event: 'pull_request', conclusion: 'cancelled', status: 'completed' },
      { event: 'pull_request', conclusion: 'cancelled', status: 'completed' },
      { event: 'pull_request', conclusion: '', status: 'queued' },
      { event: 'push', conclusion: 'failure', status: 'completed' },
    ];

    expect(checkRuns(runs)).toEqual([
      {
        event: 'pull_request',
        runs: 3,
        byConclusion: [
          ['cancelled', 2],
          ['queued', 1],
        ],
      },
      { event: 'push', runs: 1, byConclusion: [['failure', 1]] },
    ]);
  });
});

const pull = (number, kind, mergedAt, extra = {}) => ({
  number,
  title: `Refine: change ${number}`,
  labels: [{ name: `loop:${kind}` }],
  createdAt: '2026-11-13T00:00:00Z',
  mergedAt,
  state: mergedAt ? 'MERGED' : 'OPEN',
  author: { login: OWNER },
  isCrossRepository: false,
  headRefName: `loop/${kind}/x-${number}`,
  ...extra,
});

describe('mergeTimesByKind', () => {
  it('gives the hours from opened to merged per kind, most merged first', () => {
    const pulls = [
      pull(1, 'refine', '2026-11-13T01:00:00Z'),
      pull(2, 'refine', '2026-11-13T03:00:00Z'),
      pull(3, 'repair', '2026-11-13T00:30:00Z'),
      pull(4, 'feature', null),
    ];

    expect(mergeTimesByKind(pulls)).toEqual([
      { kind: 'refine', count: 2, median: 2, p90: 3, max: 3 },
      { kind: 'repair', count: 1, median: 0.5, p90: 0.5, max: 0.5 },
    ]);
  });
});

describe('closedUnmerged', () => {
  it('keeps the loop’s own pull requests that closed without merging', () => {
    const pulls = [
      pull(1, 'refine', null, { state: 'CLOSED' }),
      pull(2, 'refine', null, { state: 'CLOSED', author: { login: 'someone' } }),
      pull(3, 'refine', '2026-11-13T01:00:00Z', { state: 'CLOSED' }),
    ];

    expect(closedUnmerged(pulls, OWNER).map((p) => p.number)).toEqual([1]);
  });
});

const review = (number, body) => ({ number, author: OWNER, body: withMark(body) });

describe('review evidence', () => {
  const comments = [
    review(
      5,
      '### Review: changes needed (abc1234)\n\n- **blocker** `a.md:1`: The changelog entry has no cover.\n- **blocker** `b.ts:2`: The new string "No posts" fails §3d.\n- **minor** `c.ts`: Nit.',
    ),
    review(6, '### Review: pass (def5678)\n\nFine.'),
    { number: 7, author: 'someone', body: '### Review: changes needed\n\n- **blocker** `x`: Fake.' },
  ];

  it('reads each blocker from the loop’s own reviews only', () => {
    expect(blockerFindings(comments, OWNER)).toEqual([
      { number: 5, text: '`a.md:1`: The changelog entry has no cover.' },
      { number: 5, text: '`b.ts:2`: The new string "No posts" fails §3d.' },
    ]);
  });

  it('counts blockers by type and verdicts', () => {
    expect(blockerTypes(blockerFindings(comments, OWNER))).toEqual([
      ['changelog or help article', 1],
      ['copy', 1],
    ]);
    expect(verdicts(comments, OWNER)).toEqual([
      ['changes needed', 1],
      ['pass', 1],
    ]);
  });

  it.each([
    ['changes a protected path (`.github/`) without a reason', 'protected path without a reason'],
    ['The guide says the learn lane exists, but there is no learn lane', 'claims something that does not exist'],
    ['No e2e test drives the feature', 'no entry point or e2e test'],
    ['`claim` deletes the lock file when it was absent: a race', 'code bug'],
  ])('types %j as %s', (text, type) => {
    expect(blockerType(text)).toBe(type);
  });
});

describe('nearDuplicates', () => {
  it('pairs titles that share most of their words, ignoring the kind prefix', () => {
    const items = [
      { number: 159, title: 'Refine: Call taking a robot off the Robots view Delete' },
      { number: 160, title: 'Refine: Call taking an imported robot off the Robots view Delete' },
      { number: 161, title: 'Feature: Export STEP assemblies' },
    ];

    expect(nearDuplicates(items)).toEqual([
      {
        a: 159,
        b: 160,
        title: items[0].title,
        other: items[1].title,
        score: 0.88,
      },
    ]);
  });
});

describe('waitingSteps', () => {
  it('lists open steps oldest first with how often a builder declined each', () => {
    const declines = declinesByStep([
      { message: '#29 not built: Blocked on #19' },
      { message: '#29 not built: Blocked on #21' },
      { message: '#30: opened https://github.com/o/r/pull/1' },
    ]);
    const steps = waitingSteps({
      steps: [
        { number: 30, title: 'Newer', createdAt: '2026-11-13T08:00:00Z', labels: [{ name: 'loop:building' }] },
        { number: 29, title: 'Older', createdAt: '2026-11-13T06:00:00Z', labels: [] },
      ],
      declines,
      now: NOW,
    });

    expect(steps).toEqual([
      { number: 29, title: 'Older', hours: 3, building: false, declines: 2 },
      { number: 30, title: 'Newer', hours: 1, building: true, declines: 0 },
    ]);
  });
});
