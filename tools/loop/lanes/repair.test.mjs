import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAgent } from '../lib/agent.mjs';
import { failedJobs, lastFinishedMainCheck, openPulls } from '../lib/github.mjs';
import { json } from '../lib/sh.mjs';
import { store } from '../lib/store.mjs';
import { close, openBranch } from '../lib/worktree.mjs';
import repair from './repair.mjs';

vi.mock('../lib/agent.mjs', () => ({ CHANGE_SCHEMA: {}, runAgent: vi.fn() }));
vi.mock('../lib/github.mjs', () => ({
  failedJobs: vi.fn(),
  failedLog: vi.fn(() => 'Stop Driving left no saved try'),
  lastFinishedMainCheck: vi.fn(),
  openPulls: vi.fn(),
  repo: () => 'example/studio',
  unstickMainChecks: vi.fn(),
}));
vi.mock('../lib/pull.mjs', () => ({ publish: vi.fn(() => null) }));
vi.mock('../lib/sh.mjs', () => ({ json: vi.fn() }));
vi.mock('../lib/store.mjs', () => {
  const state = { get: vi.fn(), save: vi.fn() };

  return { store: () => state };
});
vi.mock('../lib/worktree.mjs', () => ({ openBranch: vi.fn(), close: vi.fn() }));

const failedRun = {
  databaseId: 44222219427,
  status: 'completed',
  conclusion: 'failure',
  createdAt: '2026-11-18T02:18:01Z',
  headSha: 'e816d7f',
};
const jobs = ['unit (windows-latest, 2/2)', 'e2e-windows (3)', 'check'];
const state = store('repair');

beforeEach(() => {
  vi.clearAllMocks();
  lastFinishedMainCheck.mockReturnValue(failedRun);
  failedJobs.mockReturnValue(jobs.map((name) => ({ name })));
  openPulls.mockReturnValue([]);
  json.mockReturnValue([{ headRefName: 'loop/repair/older-run', mergedAt: '2026-11-18T02:19:36Z' }]);
  state.get.mockReturnValue({ jobs: [] });
  openBranch.mockReturnValue({ dir: 'scratch/repair-fixture' });
  runAgent.mockReturnValue({ ok: true, output: { changed: false, notes: 'already repaired on current main' } });
});

describe('repair dispatch', () => {
  it('inspects an unseen failed run even after a repair for an older run merged', () => {
    repair({ log: vi.fn() });

    expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({ name: 'repair' }));
    expect(state.save).toHaveBeenCalledWith(failedRun.databaseId, { jobs });
    expect(close).toHaveBeenCalledWith({ dir: 'scratch/repair-fixture' });
    expect(json).not.toHaveBeenCalled();
  });

  it('does not repeat the session once its jobs have been inspected', () => {
    state.get.mockReturnValue({ jobs });
    repair({ log: vi.fn() });

    expect(runAgent).not.toHaveBeenCalled();
  });

  it('bounds startup and execution and leaves failures eligible for the next ordinary visit', () => {
    const started = Date.now();

    runAgent.mockReturnValueOnce({ ok: false, error: 'Task execution deadline exhausted' });
    repair({ log: vi.fn() });

    const { deadlineAt } = runAgent.mock.calls[0][0];

    expect(deadlineAt).toBeGreaterThanOrEqual(started + 30 * 60_000);
    expect(deadlineAt).toBeLessThanOrEqual(Date.now() + 30 * 60_000);
    expect(state.save).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith({ dir: 'scratch/repair-fixture' });
    repair({ log: vi.fn() });
    expect(runAgent).toHaveBeenCalledTimes(2);
    expect(state.save).toHaveBeenCalledWith(failedRun.databaseId, { jobs });
  });

  it('leaves an earlier open repair to finish before inspecting another run', () => {
    openPulls.mockReturnValue([{ headRefName: 'loop/repair/older-run', createdAt: new Date().toISOString() }]);
    repair({ log: vi.fn() });

    expect(runAgent).not.toHaveBeenCalled();
  });
});
