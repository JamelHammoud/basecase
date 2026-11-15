import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./github.mjs', () => ({
  closeIssue: vi.fn(),
  editPullLabels: vi.fn(),
  issueIsOpen: vi.fn(() => true),
  isPaused: () => false,
  openPulls: vi.fn(() => []),
  mergePull: vi.fn(() => ({ ok: true })),
  hasLabel: () => false,
  pullCheck: () => 'success',
  pullReview: () => 'success',
}));
vi.mock('./claim.mjs', () => ({ claim: vi.fn(() => vi.fn()) }));

import merge from '../lanes/merge.mjs';
import { closeIssue, issueIsOpen, mergePull, openPulls } from './github.mjs';
import { claim } from './claim.mjs';
import { sweepMergedSteps } from './stepClosure.mjs';
import { indexByStep, recoverStepPulls } from './stepPulls.mjs';

const rebuilt = {
  number: 719,
  state: 'MERGED',
  body: '',
  headRefName: 'loop/rebuild/import',
  labels: [{ name: 'loop:step:605' }],
};
const step = (number) => ({ number, author: { login: 'JamelHammoud' } });

beforeEach(() => vi.clearAllMocks());

describe('merge entry point', () => {
  it('closes the step of a rebuilt pull request after it lands, whatever the prose says', () => {
    openPulls.mockReturnValue([rebuilt]);
    merge({ log: vi.fn() });

    expect(mergePull).toHaveBeenCalledWith(719, 'squash');
    expect(closeIssue).toHaveBeenCalledWith(605, 'Built in #719.');
  });

  it('leaves the step open when merging fails', () => {
    mergePull.mockReturnValueOnce({ ok: false, err: 'conflict' });
    openPulls.mockReturnValue([rebuilt]);
    merge({ log: vi.fn() });

    expect(closeIssue).not.toHaveBeenCalled();
  });
});

describe('groom sweep', () => {
  it('recovers old rebuilds from runner comments and closes merged work only', () => {
    const originals = [
      { number: 698, state: 'CLOSED', headRefName: 'loop/build/605-1-import' },
      { number: 656, state: 'CLOSED', headRefName: 'loop/build/410-1-quote' },
      { number: 700, state: 'CLOSED', headRefName: 'loop/build/606-1-labels' },
    ];
    const pulls = [
      ...originals,
      { ...rebuilt, labels: [] },
      { number: 686, state: 'MERGED', body: '', headRefName: 'loop/rebuild/quote' },
      { number: 709, state: 'CLOSED', body: '', headRefName: 'loop/rebuild/labels' },
    ];
    const successors = new Map([
      [698, 719],
      [656, 686],
      [700, 709],
    ]);
    const commentsOf = (number) => [
      {
        author: 'JamelHammoud',
        body: `Rebuilt as https://github.com/example/basecase/pull/${successors.get(number)}.\n\n<!-- loop -->`,
      },
    ];
    const steps = [step(605), step(410), step(606)];
    const index = recoverStepPulls(indexByStep(pulls), {
      steps,
      pullOf: (number) => pulls.find((pull) => pull.number === number),
      commentsOf,
      slug: 'example/basecase',
    });

    sweepMergedSteps(steps, index, { log: vi.fn() });

    expect(closeIssue.mock.calls).toEqual([
      [605, 'Built in #719.'],
      [410, 'Built in #686.'],
    ]);
  });

  it('does not close held or already closed steps, and dry runs make no writes', () => {
    const index = indexByStep([rebuilt]);

    claim.mockReturnValueOnce(null);
    sweepMergedSteps([step(605)], index, { log: vi.fn() });
    issueIsOpen.mockReturnValueOnce(false);
    sweepMergedSteps([step(605)], index, { log: vi.fn() });
    sweepMergedSteps([step(605)], index, { log: vi.fn(), dry: true });

    expect(closeIssue).not.toHaveBeenCalled();
  });
});
