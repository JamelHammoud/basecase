import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refinement-budget-'));
const quarterWeek = 7 * 24 * 60 * 60_000 * 0.25;
const quota = (used, now = Date.now()) => ({
  at: now,
  windows: [{ minutes: 10080, used, reset: now + 3 * quarterWeek }],
});

vi.stubEnv('BASECASE_LOOP_DIR', dir);
vi.mock('./quota.mjs', () => ({
  quotaSnapshot: () => quota(1),
}));

const { refinementWorkBudget, refinementQuotaHold, runWithinRefinementBudget } = await import('./refinementBudget.mjs');
const { recordSession } = await import('./sessionJournal.mjs');

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

const session = (lane, workId, tokens) => ({
  lane,
  workId,
  startedAt: Date.now(),
  provider: 'codex',
  usage: { input_tokens: tokens, output_tokens: 0 },
});

it('allows standalones one tenth of combined recorded work and estimates both preflight and primary calls together', () => {
  const work = [
    session('build', 'assigned-work-on-a-refine-worker', 1800),
    session('refine', 'same-worktree', 60),
    session('refine', 'same-worktree', 20),
    { ...session('refine', 'other-worktree', 20), previousUsage: { input_tokens: 20, output_tokens: 0 } },
    { ...session('refine', 'running', 0), state: 'running', usage: undefined },
  ];

  expect(refinementWorkBudget(work)).toEqual({ spent: 180, estimate: 60, allowance: 200 });
});

it('blocks on stale or ahead-of-plan quota and lets fresh sustainable readings through', () => {
  const now = 4 * quarterWeek;

  expect(refinementQuotaHold(quota(17, now), now)).toBeNull();
  expect(refinementQuotaHold(quota(24, now), now)).toMatch(/ahead/);
  expect(refinementQuotaHold(quota(20, now), now + 61_000)).toMatch(/fresh/);
  expect(refinementQuotaHold(quota(90, now), now)).toMatch(/fresh/);
});

it('reserves one standalone run, releases after failures and charges recent usage before starting another', () => {
  const now = Date.now();
  const log = vi.fn();
  const job = vi.fn();

  for (let count = 0; count < 9; count++) recordSession(session('build', `product-${count}`, 100));

  expect(() =>
    runWithinRefinementBudget(() => {
      runWithinRefinementBudget(job, log);

      throw new Error('worktree failed');
    }, log),
  ).toThrow('worktree failed');
  expect(job).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith('waiting: another standalone refinement is running');
  runWithinRefinementBudget(job, log);
  expect(job).toHaveBeenCalledOnce();
  recordSession({ ...session('refine', 'old', 100), startedAt: now - 25 * 60 * 60_000 });
  runWithinRefinementBudget(job, log);
  expect(job).toHaveBeenCalledTimes(2);
  recordSession(session('refine', 'new', 100));
  runWithinRefinementBudget(job, log);
  expect(job).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledWith('waiting: standalone refinement reached its 24-hour work budget');
});
