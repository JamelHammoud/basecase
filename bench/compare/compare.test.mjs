import { describe, expect, it } from 'vitest';
import { indexEntry } from '../archive.mjs';
import { appTimeouts } from '../metrics.mjs';
import { mainServedModel, resolveModel, servedMismatch, sharedEffort } from './models.mjs';
import { canStart, historicalRunCost, roundJobs, settled } from './plan.mjs';
import { cachedRuns, runFromCache } from './cache.mjs';
import { runOnSlots } from '../slots.mjs';
import { bootstrapCI, compareStats, signTestP, verdict } from './stats.mjs';
import { compareMarkdown } from './report.mjs';

const levels = (...ids) => ids.map((id) => ({ id, name: id }));
const AVAILABLE = [
  { id: 'default', name: 'Default', resolvesTo: 'Opus 5.5', effortLevels: [] },
  { id: 'opus', name: 'Opus', effortLevels: levels('low', 'medium', 'high', 'xhigh', 'max') },
  { id: 'fable', name: 'Fable', effortLevels: levels('low', 'medium', 'high') },
];
const usage = (rows) => rows.map(([model, outputTokens]) => ({ model, token_count: { outputTokens, totalTokens: 0 } }));

describe('model choice', () => {
  it('maps a name, an option id or a full model id to the agent option', () => {
    expect(resolveModel('Fable', AVAILABLE).id).toBe('fable');
    expect(resolveModel('opus', AVAILABLE).expectServed).toBeNull();
    expect(resolveModel('claude-fable-5-2', AVAILABLE)).toMatchObject({
      id: 'fable',
      expectServed: 'claude-fable-5-2',
    });
  });

  it('refuses a model the agent does not offer, listing what it does', () => {
    expect(() => resolveModel('gemini', AVAILABLE)).toThrow('It offers: default, opus, fable.');
  });

  it('names the model that wrote most of the answer, not a helper model', () => {
    expect(
      mainServedModel(
        usage([
          ['claude-haiku-5-5', 300],
          ['claude-fable-5-2', 9000],
        ]),
      ),
    ).toBe('claude-fable-5-2');
    expect(mainServedModel(undefined)).toBeNull();
  });

  it('catches an alias that resolved to an older version', () => {
    const asked = resolveModel('claude-fable-5-2', AVAILABLE);

    expect(servedMismatch(asked, 'claude-fable-5-1')).toBe('Asked for claude-fable-5-2 but claude-fable-5-1 answered.');
    expect(servedMismatch(asked, 'claude-fable-5-2[1m]')).toBeNull();
    expect(servedMismatch(resolveModel('fable', AVAILABLE), 'claude-fable-5-1')).toBeNull();
  });

  it('pins one effort both models offer', () => {
    const both = AVAILABLE.slice(1);

    expect(sharedEffort(both)).toBe('high');
    expect(sharedEffort(both, 'low')).toBe('low');
    expect(() => sharedEffort(both, 'max')).toThrow('Shared levels: low, medium, high.');
  });
});

describe('rounds and budget', () => {
  it('runs both models on every task each round, alternating which goes first', () => {
    const jobs = roundJobs({ tasks: ['A', 'B'], labels: ['x', 'y'], seed: 1 });

    expect(jobs.map((j) => `${j.task}${j.label}`)).toEqual(['Ay', 'Ax', 'Bx', 'By']);
  });

  it('starts a run only if it and the runs in flight fit the budget', () => {
    expect(canStart({ spent: 0, inflight: 0, perRun: null, budget: 1 })).toBe(true);
    expect(canStart({ spent: 6, inflight: 3, perRun: 1, budget: 10 })).toBe(true);
    expect(canStart({ spent: 6, inflight: 4, perRun: 1, budget: 10 })).toBe(false);
  });

  it('keeps every slot busy until the queue is empty', async () => {
    const seen = [];
    const done = await runOnSlots(['s1', 's2'], [1, 2, 3, 4, 5], async (job, slot) => {
      seen.push(slot);
      await new Promise((r) => setTimeout(r, job));

      return job * 10;
    });

    expect(done.sort((x, y) => x - y)).toEqual([10, 20, 30, 40, 50]);
    expect(new Set(seen)).toEqual(new Set(['s1', 's2']));
  });

  it('estimates a run from past micro runs of the same task', () => {
    const entries = [
      { kind: 'micro', task: 'A', costUsd: 1 },
      { kind: 'micro', task: 'A', costUsd: 3 },
      { kind: 'micro', task: 'B', costUsd: 6 },
      { kind: 'robot', task: 'A', costUsd: 50 },
    ];

    expect(historicalRunCost(entries, ['A', 'C'])).toBeCloseTo((2 + 10 / 3) / 2);
    expect(historicalRunCost([], ['A'])).toBeNull();
  });
});

const run = (model, task, status, costUsd = 1) => ({
  model,
  task,
  status,
  costUsd,
  seconds: 60,
  servedBy: `${model}-id`,
});

function results(aPasses, bPasses) {
  const tasks = ['A', 'B', 'C', 'D', 'E', 'F'];

  return tasks.flatMap((t, i) => [
    run('fable', t, i < aPasses ? 'pass' : 'fail'),
    run('opus', t, i < bPasses ? 'pass' : 'fail', 2),
  ]);
}

describe('paired statistics', () => {
  it('is deterministic and brackets the mean', () => {
    const ci = bootstrapCI([0, 1, 1, 0, 1]);

    expect(ci).toEqual(bootstrapCI([0, 1, 1, 0, 1]));
    expect(ci[0]).toBeLessThanOrEqual(0.6);
    expect(ci[1]).toBeGreaterThanOrEqual(0.6);
  });

  it('gives an exact two-sided sign test', () => {
    expect(signTestP(6, 0)).toBeCloseTo(0.03125);
    expect(signTestP(3, 3)).toBe(1);
    expect(signTestP(0, 0)).toBeNull();
  });

  it('calls a clear winner only when the interval excludes zero', () => {
    const models = ['fable', 'opus'];

    expect(verdict(compareStats(results(6, 0), models), models)).toBe('fable passes more tasks than opus.');
    expect(verdict(compareStats(results(3, 3), models), models)).toMatch(/^No practical difference/);
  });

  it('stops early on a clear winner or a gap inside the margin, not before five tasks', () => {
    const models = ['fable', 'opus'];
    const split = (n) =>
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
        .slice(0, n)
        .flatMap((t, i) => [run('fable', t, i % 2 ? 'pass' : 'fail'), run('opus', t, i % 2 ? 'fail' : 'pass')]);

    expect(settled(compareStats(results(6, 0), models), { margin: 0.1 })).toBe('winner');
    expect(settled(compareStats(results(3, 3), models), { margin: 0.1 })).toBe('equivalent');
    expect(settled(compareStats(split(8), models), { margin: 0.1 })).toBeNull();
    expect(settled(compareStats(results(6, 0).slice(0, 8), models), { margin: 0.1 })).toBeNull();
  });

  it('reports cost per model and which model answered', () => {
    const stats = compareStats(results(4, 2), ['fable', 'opus']);

    expect(stats.models[0]).toMatchObject({ costUsd: 6, passesPerDollar: 0.67, servedBy: ['fable-id'] });
    expect(stats.models[1]).toMatchObject({ costUsd: 12, meanPassRate: 0.333 });

    const md = compareMarkdown({
      stats,
      models: [resolveModel('fable', AVAILABLE), resolveModel('opus', AVAILABLE)],
      labels: ['fable', 'opus'],
      effort: 'high',
      plan: { harness: 'h1', rounds: 1, maxRounds: 3, tasks: 6, parallel: 8, stop: 'winner', margin: 0.1 },
      git: { commit: 'abc123', dirty: false },
    });

    expect(md).toContain('# fable vs opus');
    expect(md).toContain('1 of 3 rounds over 6 tasks, 8 at a time, stopped early');
    expect(md).toContain('| fable | fable-id | 0.667 |');
  });
});

describe('run index', () => {
  it('records the model each run asked for and the one that answered', () => {
    const entry = indexEntry({
      run: 'r',
      task: 'A',
      kind: 'micro',
      summary: { grade: 'pass', model: 'fable', effort: 'high', servedBy: 'claude-fable-5-2', metrics: {} },
      git: {},
      at: new Date(0),
    });

    expect(entry).toMatchObject({ model: 'fable', effort: 'high', servedBy: 'claude-fable-5-2' });
  });
});

describe('baseline cache', () => {
  const entry = (over) => ({
    kind: 'micro',
    harness: 'h1',
    effort: 'high',
    servedBy: 'claude-opus-5-5',
    grade: 'pass',
    task: 'A',
    run: 'old',
    seed: 1,
    at: '2026-11-01T00:00:00Z',
    costUsd: 2,
    ...over,
  });

  it('reuses only runs of the same model, effort and harness, oldest first', () => {
    const entries = [
      entry({ at: '2026-11-02T00:00:00Z', seed: 2 }),
      entry({}),
      entry({ harness: 'h0' }),
      entry({ effort: 'low' }),
      entry({ servedBy: 'claude-opus-5-1' }),
      entry({ grade: 'error' }),
      entry({ task: 'B', servedBy: 'claude-opus-5-5[1m]' }),
    ];
    const byTask = cachedRuns(entries, { harness: 'h1', effort: 'high', served: 'claude-opus-5-5' });

    expect(byTask.get('A').map((e) => e.seed)).toEqual([1, 2]);
    expect(byTask.get('B')).toHaveLength(1);
    expect(cachedRuns(entries, { harness: 'h1', effort: 'high', served: null }).size).toBe(0);
  });

  it('marks a reused run so its cost is not counted as spent', () => {
    const reused = runFromCache(entry({}), 'opus');
    const stats = compareStats([reused, { ...reused, model: 'fable', cached: undefined }], ['fable', 'opus']);

    expect(reused).toMatchObject({ status: 'pass', model: 'opus', cached: 'old' });
    expect(stats.models.map((m) => [m.spentUsd, m.reused])).toEqual([
      [2, 0],
      [0, 1],
    ]);
  });
});

describe('harness health', () => {
  const failed = (text) => ({
    type: 'acp-session-update',
    update: { sessionUpdate: 'tool_call_update', status: 'failed', content: [{ content: { text } }] },
  });

  it('counts tool calls that never reached the app, not ordinary tool errors', () => {
    const records = [
      failed('The app didn’t answer "snapshot" in time.'),
      failed('Expected size 40 mm, got 38 mm.'),
      failed('The app window is not open.'),
    ];

    expect(appTimeouts(records)).toBe(2);
  });
});
