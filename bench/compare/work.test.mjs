import { describe, expect, it } from 'vitest';
import { compareStats } from './stats.mjs';
import { tokensOf } from '../metrics.mjs';
import { readIndex } from '../archive.mjs';
import { runFromCache } from './cache.mjs';
import { fileURLToPath } from 'node:url';
import { compareMarkdown } from './report.mjs';

const attempt = (task, status, tokens, { seconds, ...extra }) => ({
  model: 'candidate',
  task,
  status,
  seconds,
  tokens: { total: tokens, cacheRead: 2 },
  toolCalls: 1,
  ...extra,
});

describe('comparison work replay', () => {
  it('charges failed attempts and repeated successes to distinct successful tasks, separating reused baselines', () => {
    const rows = readIndex(fileURLToPath(new URL('./fixtures', import.meta.url))).map((entry, index) => ({
      ...runFromCache(entry, 'candidate'),
      cached: index === 4 ? entry.run : false,
    }));
    const stats = compareStats(rows, ['candidate']);
    const { work } = stats.models[0];

    expect(work.all).toMatchObject({
      attempts: 5,
      successfulTasks: 2,
      tokens: { total: 150, perSuccessfulTask: 75, missing: 0 },
      seconds: { total: 20, perSuccessfulTask: 10 },
    });
    expect(work.live).toMatchObject({
      attempts: 4,
      successfulTasks: 1,
      tokens: { total: 100, perSuccessfulTask: 100 },
      cachedInputTokens: { total: 8 },
    });
    expect(work.reused).toMatchObject({
      attempts: 1,
      successfulTasks: 1,
      tokens: { total: 50 },
      seconds: { total: 6 },
    });
  });

  it('renders measured work and missing baseline measurements in the report', () => {
    const stats = compareStats(
      [attempt('A', 'pass', 10, { seconds: 2 }), attempt('B', 'fail', null, { seconds: 3, tokens: null })],
      ['candidate', 'base'],
    );
    const markdown = compareMarkdown({
      stats,
      models: [{ arg: 'model', id: 'model' }],
      labels: ['candidate', 'base'],
      plan: { arms: [] },
    });

    expect(markdown).toContain('| candidate | all | 2 | 1 | tokens | 10 | missing | 1 |');
    expect(markdown).toContain('| base | reused | 0 | 0 | tokens | missing | missing | 0 |');
    expect(markdown).toContain('Cached input tokens are reported separately');
  });

  it('leaves zero-success and missing measurements explicit rather than imputing zero work', () => {
    const rows = [
      attempt('A', 'fail', 10, { seconds: 2 }),
      attempt('B', 'error', null, { seconds: null, toolCalls: undefined, tokens: null }),
    ];
    const { work } = compareStats(rows, ['candidate']).models[0];

    expect(work.all.tokens).toEqual({ total: 10, missing: 1, perSuccessfulTask: null });
    expect(work.all.seconds).toEqual({ total: 2, missing: 1, perSuccessfulTask: null });
    expect(work.all.toolCalls.missing).toBe(1);
    expect(work.reused.tokens).toEqual({ total: null, missing: 0, perSuccessfulTask: null });
    rows.push(attempt('C', 'pass', 30, { seconds: 4 }));
    expect(compareStats(rows, ['candidate']).models[0].work.all.tokens.perSuccessfulTask).toBeNull();
  });

  it('preserves absent token fields in archived usage', () => {
    expect(tokensOf({})).toEqual({ input: null, output: null, cacheRead: null, cacheWrite: null, total: null });
    expect(tokensOf({ inputTokens: 0, totalTokens: 12, cachedReadTokens: 3 })).toMatchObject({
      input: 0,
      cacheRead: 3,
      total: 12,
    });
  });
});
