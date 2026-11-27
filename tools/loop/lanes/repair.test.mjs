import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAgent } from '../lib/agent.mjs';
import { hasPendingWorktree } from '../lib/deliveryState.mjs';
import { failedJobs, lastFinishedMainCheck, openPulls } from '../lib/github.mjs';
import { publish } from '../lib/pull.mjs';
import { expandsTestExclusions } from '../lib/repairCoverage.mjs';
import { json } from '../lib/sh.mjs';
import { store } from '../lib/store.mjs';
import { close, openBranch } from '../lib/worktree.mjs';
import repair from './repair.mjs';

vi.mock('../lib/repairCoverage.mjs', () => ({ expandsTestExclusions: vi.fn() }));
vi.mock('../lib/agent.mjs', () => ({ CHANGE_SCHEMA: {}, runAgent: vi.fn() }));
vi.mock('../lib/github.mjs', () => ({
  failedJobs: vi.fn(),
  hasLabel: (pull, label) => (pull.labels ?? []).some((entry) => entry.name === label),
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
vi.mock('../lib/workRecovery.mjs', () => ({
  recoveryFor: vi.fn(() => null),
  saveRecovery: vi.fn(),
  clearRecovery: vi.fn(),
}));
vi.mock('../lib/deliveryState.mjs', () => ({ hasPendingWorktree: vi.fn(() => false) }));

const failedRun = {
  databaseId: 44222219427,
  status: 'completed',
  conclusion: 'failure',
  createdAt: '2026-11-18T02:18:01Z',
  headSha: 'e816d7f',
};
const jobs = ['unit (windows-latest, 2/2)', 'e2e-windows (3)', 'check'];
const state = store('repair');
const closedPages = (nodes) => [{ data: { repository: { pullRequests: { nodes } } } }];

beforeEach(() => {
  vi.clearAllMocks();
  expandsTestExclusions.mockReturnValue(false);
  hasPendingWorktree.mockReturnValue(false);
  lastFinishedMainCheck.mockReturnValue(failedRun);
  failedJobs.mockReturnValue(jobs.map((name) => ({ name })));
  openPulls.mockReturnValue([]);
  json.mockReturnValue([]);
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

it('leaves a labeled repair on a custom loop branch to finish before starting another', () => {
  openPulls.mockReturnValue([
    {
      headRefName: 'loop/restore-nightly-pipelines',
      labels: [{ name: 'loop:repair' }],
      createdAt: new Date().toISOString(),
    },
  ]);
  repair({ log: vi.fn() });
  expect(runAgent).not.toHaveBeenCalled();
  expect(openBranch).not.toHaveBeenCalled();
});

it('does not treat an unrelated custom branch as an active repair', () => {
  openPulls.mockReturnValue([
    {
      headRefName: 'loop/new-feature',
      labels: [{ name: 'loop:feature' }],
      createdAt: new Date().toISOString(),
    },
  ]);
  repair({ log: vi.fn() });
  expect(runAgent).toHaveBeenCalledOnce();
});

it('keeps the existing six-hour bound for a labeled repair', () => {
  openPulls.mockReturnValue([
    {
      headRefName: 'loop/restore-nightly-pipelines',
      labels: [{ name: 'loop:repair' }],
      createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
    },
  ]);
  repair({ log: vi.fn() });
  expect(runAgent).toHaveBeenCalledOnce();
});

it('refuses new test exclusions without marking the failed jobs handled', () => {
  expandsTestExclusions.mockReturnValue(true);
  runAgent.mockReturnValueOnce({ ok: true, output: { changed: true } });
  repair({ log: vi.fn() });
  expect(publish).not.toHaveBeenCalled();
  expect(state.save).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
  expandsTestExclusions.mockReturnValue(false);
  repair({ log: vi.fn() });
  expect(runAgent).toHaveBeenCalledTimes(2);
  expect(state.save).toHaveBeenCalledWith(failedRun.databaseId, { jobs });
});

it('reopens handled jobs once after their repair closes without merging', () => {
  state.get.mockReturnValue({ jobs });
  json.mockReturnValue(
    closedPages([
      {
        number: 99,
        body: `[Check](https://github.com/example/studio/actions/runs/${failedRun.databaseId})`,
        mergedAt: null,
      },
    ]),
  );
  repair({ log: vi.fn() });
  expect(runAgent).toHaveBeenCalledOnce();
  expect(state.save).toHaveBeenCalledWith(failedRun.databaseId, { jobs: [], releasedPulls: [99] });
  expect(state.save).toHaveBeenLastCalledWith(failedRun.databaseId, { jobs, releasedPulls: [99] });
  runAgent.mockClear();
  state.get.mockReturnValue({ jobs, releasedPulls: [99] });
  repair({ log: vi.fn() });
  expect(runAgent).not.toHaveBeenCalled();
});

it('keeps merged repairs and closures from another run handled', () => {
  state.get.mockReturnValue({ jobs });
  json.mockReturnValue(
    closedPages([
      {
        number: 99,
        body: `https://github.com/example/studio/actions/runs/${failedRun.databaseId}`,
        mergedAt: '2026-11-18T02:19:36Z',
      },
      { number: 100, body: `https://github.com/example/studio/actions/runs/${failedRun.databaseId}0`, mergedAt: null },
    ]),
  );
  repair({ log: vi.fn() });
  expect(runAgent).not.toHaveBeenCalled();
});

it('records handled jobs only after publication preparation or durable delivery', () => {
  publish.mockImplementationOnce(() => {
    throw new Error('body preparation failed');
  });
  expect(() => repair({ log: vi.fn() })).toThrow('body preparation failed');
  expect(state.save).not.toHaveBeenCalled();
  publish.mockImplementationOnce(() => {
    hasPendingWorktree.mockReturnValue(true);

    throw new Error('delivery failed');
  });
  expect(() => repair({ log: vi.fn() })).toThrow('delivery failed');
  expect(state.save).toHaveBeenCalledWith(failedRun.databaseId, { jobs });
});
