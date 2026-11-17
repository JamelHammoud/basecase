import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  agent: vi.fn(),
  comment: vi.fn(),
  closePull: vi.fn(),
  update: vi.fn(),
  status: vi.fn(),
  reviewState: vi.fn(),
  pullReview: vi.fn(),
  comments: vi.fn(),
  patch: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock('../lib/agent.mjs', () => ({ runAgent: mocks.agent }));
vi.mock('../lib/sessionJournal.mjs', () => ({ updateSession: mocks.update }));
vi.mock('../lib/claim.mjs', () => ({ claim: () => () => {} }));
vi.mock('../lib/branches.mjs', () => ({ fetchAll: () => {}, ownPatchId: mocks.patch, resolveSha: mocks.resolve }));
vi.mock('../lib/copy.mjs', () => ({ copyReport: () => ({ text: 'Copy: 0' }) }));
vi.mock('../lib/reviewPrompt.mjs', () => ({ reviewPrompt: () => 'Review fixture' }));
vi.mock('../lib/inFlight.mjs', () => ({
  duplicateTarget: ({ duplicateOf }) => duplicateOf,
  inFlight: () => ({ open: [], merged: [] }),
  inFlightText: () => '',
}));
vi.mock('../lib/smallChange.mjs', () => ({ isSmall: () => false }));
vi.mock('../lib/voiceHook.mjs', () => ({ voiceNewPages: vi.fn() }));
vi.mock('../lib/deliveryState.mjs', () => ({ hasPendingDelivery: () => false }));
vi.mock('../lib/worktree.mjs', () => ({ openPullHead: () => ({ dir: 'fixture' }), close: vi.fn() }));
vi.mock('../lib/sh.mjs', () => ({ run: () => ({ ok: true, out: '' }) }));
vi.mock('../lib/github.mjs', () => ({
  closePull: mocks.closePull,
  commentOnPull: mocks.comment,
  setReview: mocks.status,
  openPulls: () => [{ number: 2, headRefOid: 'abcdef123', title: 'Refine: Fixture', body: '' }],
  pullCheck: () => 'success',
  pullReview: mocks.pullReview,
  pullComments: mocks.comments,
  reviewState: mocks.reviewState,
}));

const { default: review } = await import('./review.mjs');
const runReview = () => review({ log: () => {} });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.pullReview.mockReturnValue(null);
  mocks.comments.mockReturnValue([]);
  mocks.agent.mockReturnValue({
    ok: true,
    journalId: 'invocation',
    output: { verdict: 'pass', summary: 'Fixture', findings: [] },
  });
});

it.each([null, 'error'])('handles an unchanged patch with review state %s', (state) => {
  mocks.pullReview.mockReturnValue(state);
  mocks.comments.mockReturnValue([{ body: '### Review: changes needed (1234567)' }]);
  mocks.resolve.mockReturnValue('123456789');
  mocks.patch.mockReturnValue('same-patch');
  mocks.reviewState.mockReturnValue('failure');
  runReview();

  if (state === null) {
    expect(mocks.agent).not.toHaveBeenCalled();
    expect(mocks.status).toHaveBeenCalledWith('abcdef123', 'failure', expect.stringContaining('Carried over'));

    return;
  }

  expect(mocks.agent).toHaveBeenCalledOnce();
  expect(mocks.status).toHaveBeenLastCalledWith('abcdef123', 'success', 'Fixture');
});

it.each(['pass', 'fail'])('records the published %s outcome after the comment succeeds', (verdict) => {
  mocks.agent.mockReturnValue({
    ok: true,
    journalId: 'invocation',
    output: { verdict: 'pass', summary: 'Fixture', findings: verdict === 'fail' ? [{ severity: 'blocker' }] : [] },
  });
  mocks.comment.mockImplementation(() => expect(mocks.update).not.toHaveBeenCalled());
  runReview();
  expect(mocks.comment.mock.calls[0][1]).toContain(verdict === 'pass' ? 'Review: pass' : 'Review: changes needed');
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith('invocation', { reviewOutcome: verdict });
});

it('leaves the proposed verdict unknown when publishing its comment fails', () => {
  mocks.comment.mockImplementation(() => {
    throw new Error('comment failed');
  });

  expect(runReview).toThrow('comment failed');
  expect(mocks.update).not.toHaveBeenCalled();
});

it('records a duplicate only after closing its pull succeeds', () => {
  mocks.agent.mockReturnValue({ ok: true, journalId: 'invocation', output: { duplicateOf: 1 } });
  mocks.closePull.mockImplementation(() => expect(mocks.update).not.toHaveBeenCalled());
  runReview();
  expect(mocks.closePull).toHaveBeenCalledOnce();
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith('invocation', { reviewOutcome: 'duplicate' });
  expect(mocks.comment).not.toHaveBeenCalled();
});

it('leaves a proposed duplicate unknown when its closure fails', () => {
  mocks.agent.mockReturnValue({ ok: true, journalId: 'invocation', output: { duplicateOf: 1 } });
  mocks.closePull.mockImplementation(() => {
    throw new Error('closure failed');
  });

  expect(runReview).toThrow('closure failed');
  expect(mocks.update).not.toHaveBeenCalled();
});
