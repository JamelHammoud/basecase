import { describe, expect, it } from 'vitest';
import { backpressure, breaches, syncPlan } from './flow.mjs';

const now = Date.parse('2026-11-13T12:00:00Z');
const hoursAgo = (h) => new Date(now - h * 3_600_000).toISOString();

describe('backpressure', () => {
  it('holds producers back when too much waits to land or CI is backed up', () => {
    expect(backpressure({ openWaiting: 30, queuedRuns: 0 })).toMatch(/30 pull requests/);
    expect(backpressure({ openWaiting: 5, queuedRuns: 20 })).toMatch(/20 CI runs/);
    expect(backpressure({ openWaiting: 29, queuedRuns: 19 })).toBeNull();
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

    expect(plan).toEqual({ add: ['batch-1'], change: ['merge-1'], remove: ['old-1'] });
  });
});
