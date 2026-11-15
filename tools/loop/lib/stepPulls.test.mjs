import { describe, expect, it } from 'vitest';
import { indexByStep, recoverStepPulls, stepStatus, stepsOf } from './stepPulls.mjs';

const pull = (number, state, headRefName, body = '') => ({ number, state, headRefName, body });

describe('pull requests for a step', () => {
  it('finds the step from Closes and from the build branch', () => {
    expect(stepsOf(pull(1, 'OPEN', 'loop/build/21-1-rebuild', ''))).toEqual([21]);
    expect(stepsOf(pull(2, 'OPEN', 'loop/rebuild/x', 'Rebuilds #9.\n\nCloses #38.'))).toEqual([38]);
    expect(stepsOf(pull(3, 'OPEN', 'loop/build/21-1-x', 'Closes #21.'))).toEqual([21]);
  });

  it('calls a step merged once any of its pull requests merged, even with another open', () => {
    const index = indexByStep([
      pull(74, 'MERGED', 'loop/build/38-4-replay'),
      pull(376, 'OPEN', 'loop/build/38-1-replay'),
      pull(137, 'OPEN', 'loop/build/21-1-rebuild'),
      pull(50, 'CLOSED', 'loop/build/7-1-x'),
    ]);

    expect(stepStatus(index, 38)).toBe('merged');
    expect(stepStatus(index, 21)).toBe('open');
    expect(stepStatus(index, 7)).toBe('none');
    expect(stepStatus(index, 99)).toBe('none');
  });
});

it('inherits steps through rebuild chains without looping on malformed history', () => {
  const index = indexByStep([
    pull(1, 'CLOSED', 'loop/build/605-1-import', 'Rebuilds #3.'),
    pull(2, 'CLOSED', 'loop/rebuild/import', 'Rebuilds #1.'),
    pull(3, 'MERGED', 'loop/rebuild/import-again', 'Rebuilds #2.'),
  ]);

  expect(stepStatus(index, 605)).toBe('merged');
  expect(index.get(605).map((pull) => pull.number)).toEqual([1, 2, 3]);
});

it.each([
  ['outsider', 'Rebuilt as https://github.com/example/basecase/pull/719.\n\n<!-- loop -->'],
  ['JamelHammoud', 'Rebuilt as https://github.com/example/basecase/pull/719.'],
  ['JamelHammoud', 'Rebuilt as https://github.com/other/basecase/pull/719.\n\n<!-- loop -->'],
  ['JamelHammoud', 'Discussed https://github.com/example/basecase/pull/719.\n\n<!-- loop -->'],
])('ignores rebuild comments without runner provenance: %s %s', (author, body) => {
  const index = indexByStep([pull(698, 'CLOSED', 'loop/build/605-1-import')]);

  recoverStepPulls(index, {
    steps: [{ number: 605 }],
    slug: 'example/basecase',
    commentsOf: () => [{ author, body }],
    pullOf: () => pull(719, 'MERGED', 'loop/rebuild/import'),
  });

  expect(stepStatus(index, 605)).toBe('none');
});
