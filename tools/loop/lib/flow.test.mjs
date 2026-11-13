import { describe, expect, it } from 'vitest';
import { backpressure, expired, breaches, lastMergeAt, readySince, redSince, syncPlan } from './flow.mjs';

const now = Date.parse('2026-11-13T12:00:00Z');
const hoursAgo = (h) => new Date(now - h * 3_600_000).toISOString();

describe('backpressure', () => {
  it('holds producers back when too much waits to land or CI is backed up', () => {
    expect(backpressure({ openWaiting: 12, queuedRuns: 0 })).toMatch(/12 pull requests/);
    expect(backpressure({ openWaiting: 5, queuedRuns: 20 })).toMatch(/20 CI runs/);
    expect(backpressure({ openWaiting: 11, queuedRuns: 19 })).toBeNull();
  });
});

describe('breaches', () => {
  it('reports a red main, a stalled merge queue and a backed-up CI', () => {
    const found = breaches(
      {
        mainRedSince: hoursAgo(3),
        lastMergeAt: hoursAgo(2.5),
        readyCount: 12,
        oldestReadyAt: hoursAgo(2.2),
        queuedRuns: 44,
        oldestQueuedAt: hoursAgo(1.5),
      },
      now,
    );

    expect(found).toHaveLength(5);
  });

  it('is quiet when the loop flows', () => {
    const found = breaches(
      {
        mainRedSince: null,
        lastMergeAt: hoursAgo(0.3),
        readyCount: 4,
        oldestReadyAt: hoursAgo(0.5),
        queuedRuns: 3,
        oldestQueuedAt: hoursAgo(0.1),
      },
      now,
    );

    expect(found).toEqual([]);
  });

  it("doesn't call a quiet day a stall when nothing waits", () => {
    expect(
      breaches(
        { lastMergeAt: hoursAgo(9), readyCount: 0, queuedRuns: 0, oldestReadyAt: null, mainRedSince: null },
        now,
      ),
    ).toEqual([]);
  });
});

describe('syncPlan', () => {
  it('adds new lanes, reloads changed ones and removes gone ones, leaving the rest running', () => {
    const plan = syncPlan(
      [
        { name: 'batch-1', contents: 'b' },
        { name: 'merge-1', contents: 'm2' },
        { name: 'review-1', contents: 'r' },
      ],
      [
        { name: 'merge-1', contents: 'm1' },
        { name: 'review-1', contents: 'r' },
        { name: 'old-1', contents: 'o' },
      ],
    );

    expect(plan).toEqual({ add: ['batch-1'], change: ['merge-1'], remove: ['old-1'], busy: [] });
  });

  it('leaves a changed or removed slot alone while it runs, for the next sync', () => {
    const plan = syncPlan(
      [
        { name: 'build-1', contents: 'b2' },
        { name: 'review-1', contents: 'r2' },
      ],
      [
        { name: 'build-1', contents: 'b1' },
        { name: 'review-1', contents: 'r1' },
        { name: 'old-1', contents: 'o' },
      ],
      new Set(['build-1', 'old-1']),
    );

    expect(plan).toEqual({ add: [], change: ['review-1'], remove: [], busy: ['build-1', 'old-1'] });
  });
});

describe('redSince', () => {
  const runAt = (conclusion, h) => ({ conclusion, createdAt: hoursAgo(h) });

  it('is null while the newest finished run is green', () => {
    expect(redSince([runAt('success', 1), runAt('failure', 2)])).toBeNull();
  });

  it('dates red from the oldest failure after the last green, skipping cancelled and skipped runs', () => {
    const runs = [
      runAt('cancelled', 0.5),
      runAt('failure', 1),
      runAt('skipped', 1.5),
      runAt('failure', 2),
      runAt('cancelled', 2.5),
      runAt('success', 3),
    ];

    expect(redSince(runs)).toBe(hoursAgo(2));
  });

  it('dates an all-red window from its oldest run', () => {
    expect(redSince([runAt('failure', 1), runAt('timed_out', 4)])).toBe(hoursAgo(4));
  });

  it('is null with nothing finished', () => {
    expect(redSince([runAt('cancelled', 1)])).toBeNull();
  });
});

describe('readySince', () => {
  it('counts from whichever came last, the passing check or the review', () => {
    const pull = {
      createdAt: hoursAgo(5),
      statusCheckRollup: [
        { __typename: 'CheckRun', name: 'unit', completedAt: hoursAgo(0.2) },
        { __typename: 'CheckRun', name: 'check', completedAt: hoursAgo(1) },
        { __typename: 'StatusContext', context: 'agent-review', startedAt: hoursAgo(0.5) },
      ],
    };

    expect(readySince(pull)).toBe(hoursAgo(0.5));
  });
});

describe('lastMergeAt', () => {
  it('takes the latest merge, whatever order the list came in', () => {
    expect(lastMergeAt([{ mergedAt: hoursAgo(3) }, { mergedAt: hoursAgo(0.4) }, { mergedAt: null }])).toBe(
      hoursAgo(0.4),
    );
  });
});

describe('pull requests open too long', () => {
  const at = Date.parse('2026-11-13T16:00:00Z');
  const pull = (number, headRefName, createdAt) => ({ number, headRefName, createdAt });

  it('expires work open over six hours, except batches, repairs and pull requests riding in a batch', () => {
    const pulls = [
      pull(1, 'loop/refine/a', '2026-11-13T09:00:00Z'),
      pull(2, 'loop/refine/b', '2026-11-13T11:00:00Z'),
      pull(3, 'loop/batch/x', '2026-11-13T08:00:00Z'),
      pull(4, 'loop/repair/y', '2026-11-13T08:00:00Z'),
      pull(5, 'loop/build/z', '2026-11-13T08:00:00Z'),
    ];

    expect(expired({ pulls, inBatch: [5], now: at }).map((p) => p.number)).toEqual([1]);
  });
});
