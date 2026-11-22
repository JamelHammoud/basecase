import { beforeEach, expect, it, vi } from 'vitest';
import { UsageLimit } from '../lib/usage.mjs';

const calls = vi.hoisted(() => ({
  agent: vi.fn(),
  failures: vi.fn(() => 1),
  close: vi.fn(),
  rebuild: vi.fn(),
}));

vi.mock('../lib/agent.mjs', () => ({ runAgent: calls.agent }));
vi.mock('../lib/claim.mjs', () => ({ claim: () => vi.fn() }));
vi.mock('../lib/conflicts.mjs', () => ({ conflictLog: {}, recordConflict: vi.fn() }));
vi.mock('../lib/branches.mjs', () => ({ behindMain: () => false, conflictsWithMain: () => true, fetchAll: vi.fn() }));
vi.mock('../lib/github.mjs', () => ({
  openPulls: () => [{ number: 12, title: 'Repair: Test', body: '', headRefName: 'loop/test', headRefOid: 'head' }],
  pullCheck: () => 'success',
  pullComments: () => [],
  pullReview: () => 'success',
}));
vi.mock('../lib/pullState.mjs', () => ({
  entryFor: () => ({ rebuilt: false }),
  markRefreshed: vi.fn(),
  recordConflictFail: calls.failures,
}));
vi.mock('../lib/rebuild.mjs', () => ({ rebuild: calls.rebuild }));
vi.mock('../lib/worktree.mjs', () => ({ clearPath: vi.fn(), close: calls.close, linkModules: vi.fn() }));
vi.mock('../lib/deliveryState.mjs', () => ({ hasPendingDelivery: () => false }));
vi.mock('../lib/gitFetch.mjs', () => ({ fetchGit: vi.fn() }));
vi.mock('../lib/sh.mjs', () => ({
  run: (_command, args) => ({
    ok: args[0] !== 'merge',
    out: args.includes('--diff-filter=U') ? 'scene.ts' : '',
    err: '',
  }),
}));

const { default: rebase } = await import('./rebase.mjs');
const log = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

it('propagates capacity waits without counting a conflict failure or rebuilding', () => {
  const waiting = new UsageLimit(Date.now() + 60_000);

  calls.agent.mockImplementation(() => {
    throw waiting;
  });
  expect(() => rebase({ log })).toThrow(waiting);
  expect(calls.failures).not.toHaveBeenCalled();
  expect(calls.rebuild).not.toHaveBeenCalled();
  expect(calls.close).toHaveBeenCalledOnce();
});

it('counts a completed unsuccessful resolution', () => {
  calls.agent.mockReturnValue({ ok: true, output: { resolved: false } });
  rebase({ log });
  expect(calls.failures).toHaveBeenCalledWith(12);
  expect(calls.rebuild).not.toHaveBeenCalled();
  expect(calls.close).toHaveBeenCalledOnce();
});

it('retains failure accounting for an actual resolution error', () => {
  calls.agent.mockImplementation(() => {
    throw new Error('resolver failed');
  });
  rebase({ log });
  expect(calls.failures).toHaveBeenCalledWith(12);
  expect(calls.close).toHaveBeenCalledOnce();
});
