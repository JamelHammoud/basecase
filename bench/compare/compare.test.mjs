import { describe, expect, it } from 'vitest';
import { indexEntry } from '../archive.mjs';
import { mainServedModel, resolveModel, servedMismatch, sharedEffort } from './models.mjs';
import { historicalRunCost, nextPairFits, schedule } from './plan.mjs';
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

describe('schedule and budget', () => {
  it('runs every task once per seed before the next seed, alternating which model goes first', () => {
    const pairs = schedule({ tasks: ['A', 'B'], models: ['x', 'y'], seeds: 2 });

    expect(pairs.map((p) => `${p.seed}${p.task}:${p.order.join('')}`)).toEqual(['1A:yx', '1B:xy', '2A:xy', '2B:yx']);
  });

  it('stops before a pair that would pass the budget', () => {
    expect(nextPairFits({ spent: 0, pairCosts: [], budget: 1 })).toBe(true);
    expect(nextPairFits({ spent: 8, pairCosts: [2, 3], budget: 10 })).toBe(false);
    expect(nextPairFits({ spent: 7, pairCosts: [2, 3], budget: 10 })).toBe(true);
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
    expect(verdict(compareStats(results(3, 3), models), models)).toMatch(/^No clear difference/);
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
      plan: { done: 6, total: 6, budget: 20 },
      git: { commit: 'abc123', dirty: false },
      stopped: false,
    });

    expect(md).toContain('# fable vs opus');
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
