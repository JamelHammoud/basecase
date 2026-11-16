import { expect, it } from 'vitest';
import { comparisonOutcome } from './outcome.mjs';
import { comparison } from './fixtures/efficiency.mjs';

it('retains identical checks with less total work including failed attempts', () => {
  expect(comparisonOutcome(comparison())).toMatchObject({ outcome: 'efficiency-win', tokenReduction: 120 });
});

const rejected = {
  'aggregate tie': (result) => {
    result.results[0].status = 'fail';
    result.results[5].status = 'pass';
  },
  'check change': (result) => {
    result.results[0].checks[0].pass = false;
  },
  tokens: (result) => {
    delete result.results[0].tokens.total;
  },
  seconds: (result) => {
    delete result.results[0].seconds;
  },
  'zero successes': (result) =>
    result.results.forEach((run) => {
      run.status = 'fail';
      run.checks[0].pass = false;
    }),
  'cache only': (result) =>
    result.results.forEach((run) => {
      run.tokens.total = 200;
      run.tokens.cacheRead = run.model === 'main' ? 100 : 0;
    }),
  pairs: (result) => result.results.pop(),
  provider: (result) => {
    result.results[0].provider = 'claude';
  },
  effort: (result) => {
    result.results[0].effort = 'high';
  },
  deadline: (result) => {
    result.plan.stop = 'deadline';
  },
  objective: (result) => {
    delete result.plan.efficiencyObjective;
  },
  slower: (result) => {
    result.results[0].seconds = 1000;
  },
  timeout: (result) => {
    result.results[0].timedOut = true;
  },
  'unavailable check': (result) => {
    result.results[0].checks[0].pass = null;
  },
  'missing checks': (result) => {
    delete result.results[0].checks;
  },
  'duplicate pair': (result) => {
    result.results[0] = result.results[1];
  },
};

it.each(Object.entries(rejected))('refuses %s', (_, mutate) => {
  const result = comparison();

  mutate(result);
  expect(comparisonOutcome(result).outcome).not.toBe('efficiency-win');
});
