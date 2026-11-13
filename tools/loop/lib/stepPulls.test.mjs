import { describe, expect, it } from 'vitest';
import { indexByStep, stepStatus, stepsOf } from './stepPulls.mjs';

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
