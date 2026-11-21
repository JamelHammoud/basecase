import { describe, expect, it } from 'vitest';
import { taskUsage } from './usageTasks.mjs';
import { completionWindow } from './usageCompletions.mjs';

const usage = { input_tokens: 100, output_tokens: 20, cached_input_tokens: 80 };
const session = (task, extra = {}) => ({ task, state: 'completed', ok: true, usage, durationMs: 500, ...extra });
const pulls = [
  { number: 20, state: 'CLOSED', headRefName: 'loop/build/10-first', body: 'Closes #10.' },
  { number: 21, state: 'MERGED', headRefName: 'loop/rebuild/21-new', body: 'Closes #10. Rebuilds #20.' },
  { number: 22, state: 'OPEN', headRefName: 'loop/build/11-next', body: 'Closes #11.' },
];

describe('work per linked merged task', () => {
  it('counts failed builds and revisions of a rebuilt step once, leaving other work visible', () => {
    const report = taskUsage(
      [
        session('loop-build-10-first', { ok: false }),
        session('revise-20', {
          name: 'revise',
          previousUsage: { input_tokens: 30, output_tokens: 0, cached_input_tokens: 0 },
        }),
        session('review-21-abc'),
        session('loop-build-11-next'),
        session('unlinked'),
      ],
      pulls,
    );

    expect(report.mergedTasks).toBe(1);
    expect(report.tasks[0]).toMatchObject({
      task: 'step:10',
      sessions: 3,
      completedSessions: 3,
      failedAttempts: 1,
      revisions: 1,
      tokens: 390,
      cachedInputTokens: 240,
      milliseconds: 1500,
    });
    expect(report.workPerMergedTask).toMatchObject({ tokens: 390, milliseconds: 1500 });
    expect(report.unmerged.sessions).toBe(1);
    expect(report.unattributed.sessions).toBe(1);
  });

  it('reports null measurements and denominators with zero successes instead of invented zero work', () => {
    const report = taskUsage([session('loop-build-11-next', { usage: null, durationMs: undefined })], pulls);

    expect(report.mergedTasks).toBe(0);
    expect(report.workPerMergedTask).toEqual({ tokens: null, milliseconds: null });
    expect(report.unmerged).toMatchObject({ missingUsage: 1, missingElapsed: 1, tokens: null, milliseconds: null });
  });

  it('keeps incomplete measurements explicit when a merged task has a failed attempt without usage', () => {
    const report = taskUsage([session('revise-21', { ok: false, usage: null }), session('review-21-abc')], pulls);

    expect(report.tasks[0]).toMatchObject({ tokens: null, measuredTokens: 120, missingUsage: 1 });
    expect(report.workPerMergedTask.tokens).toBeNull();
    expect(report.workPerMergedTask.milliseconds).toBe(1000);
  });

  it('marks partial main and formatting-retry usage as missing while retaining measured subtotals', () => {
    const report = taskUsage(
      [
        session('revise-21', { usage: { cached_input_tokens: 80 } }),
        session('revise-21', { usage: { input_tokens: 10 } }),
        session('revise-21', { previousUsage: { input_tokens: 30 } }),
        session('revise-21', { previousUsage: null }),
        session('revise-21', { formatRetried: true }),
      ],
      pulls,
    );

    expect(report.tasks[0]).toMatchObject({ tokens: null, measuredTokens: 400, missingUsage: 5 });
    expect(report.workPerMergedTask.tokens).toBeNull();
  });

  it('distinguishes absent cache measurements and unusable durations from measured zero', () => {
    const report = taskUsage(
      [
        session('revise-21', { usage: { input_tokens: 10, output_tokens: 0 }, durationMs: -1 }),
        session('revise-21', { previousUsage: { input_tokens: 0, output_tokens: 0 }, durationMs: NaN }),
        session('revise-21', {
          usage: { input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 0 },
          durationMs: 0,
        }),
        session('revise-21'),
      ],
      pulls,
    );

    expect(report.tasks[0]).toMatchObject({
      cachedInputTokens: null,
      measuredCachedInputTokens: 160,
      missingCachedInput: 2,
      milliseconds: null,
      measuredMilliseconds: 500,
      missingElapsed: 2,
    });
    expect(report.workPerMergedTask.milliseconds).toBeNull();
  });

  it('keeps every session unattributed when task linkage could not be loaded', () => {
    expect(taskUsage([session('revise-21')], null)).toMatchObject({
      linkageAvailable: false,
      mergedTasks: 0,
      unattributed: { sessions: 1 },
    });
  });

  it('keeps Claude totals incomplete when cache usage is absent from a main or repair attempt', () => {
    const claudeUsage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 };
    const report = taskUsage(
      [
        session('revise-21', { provider: 'claude', usage: claudeUsage }),
        session('revise-21', {
          provider: 'claude',
          usage: { ...claudeUsage, cache_creation_input_tokens: 20 },
          previousUsage: { input_tokens: 10, output_tokens: 5 },
        }),
      ],
      pulls,
    );

    expect(report.mergedWork).toMatchObject({ tokens: null, measuredTokens: 265, missingUsage: 2 });
    expect(report.workPerMergedTask.tokens).toBeNull();
  });
});

it('attributes borrowed product capacity by task kind while retaining its worker and review attempts', () => {
  const report = taskUsage(
    [
      session('step-10', { name: 'build', lane: 'build', worker: 'refine-2', taskKind: 'integration' }),
      session('review-21', { name: 'review', lane: 'review' }),
      session('revise-21', { name: 'revise', lane: 'revise', ok: false }),
    ],
    pulls,
  );

  expect(report.tasks[0]).toMatchObject({
    kind: 'integration',
    workers: ['refine-2'],
    reviewAttempts: 1,
    failedAttempts: 1,
  });
  expect(report.byKind.integration).toMatchObject({
    mergedTasks: 1,
    tokensPerMergedTask: 360,
    millisecondsPerMergedTask: 1500,
  });
});

it('counts incomplete attempts per shipped feature and all observed work per completion', () => {
  const incomplete = { result: { outcome: { status: 'incomplete' } }, taskKind: 'feature' };
  const report = taskUsage(
    [session('step-10', incomplete), session('review-21'), session('step-11', incomplete)],
    pulls,
  );

  expect(report.byKind.feature).toMatchObject({ mergedTasks: 1, incompleteAttemptsPerMergedTask: 1 });
  expect(report.totalWork).toMatchObject({ incompleteAttempts: 2, sessions: 3 });
  expect(report.totalWorkPerMergedTask).toEqual({ tokens: 360, milliseconds: 1500 });
  expect(report.workPerMergedTask).toEqual({ tokens: 240, milliseconds: 1000 });

  const window = completionWindow(
    { ...report, tasks: report.tasks.map((task) => ({ ...task, mergedAt: '2026-11-16T00:00:00Z' })) },
    { since: Date.parse('2026-11-16'), until: Date.parse('2026-11-17'), pulls },
  );

  expect(window.byKind.feature).toMatchObject({ incompleteAttemptsPerCompletion: 1, unknownBuildOutcomes: 0 });
  expect(taskUsage([session('step-11', incomplete)], pulls).totalWorkPerMergedTask.tokens).toBeNull();
  expect(
    taskUsage([session('step-10', incomplete), session('unlinked', { usage: null })], pulls).totalWorkPerMergedTask
      .tokens,
  ).toBeNull();
});
