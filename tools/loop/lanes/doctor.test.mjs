import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGS } from '../lib/paths.mjs';
import { UsageLimit } from '../lib/usage.mjs';
import doctor from './doctor.mjs';

const mocks = vi.hoisted(() => ({
  state: {},
  agent: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  pulls: vi.fn(),
  exclusions: vi.fn(),
  publish: vi.fn(),
  repairs: vi.fn(),
  retained: vi.fn(),
}));

vi.mock('../lib/activeRepairEvidence.mjs', () => ({
  activeRepairEvidence: mocks.repairs,
  retainedRepairEvidence: mocks.retained,
}));
vi.mock('../lib/agent.mjs', () => ({ CHANGE_SCHEMA: {}, runAgent: mocks.agent }));
vi.mock('../lib/store.mjs', () => ({
  store: () => ({
    get: () => structuredClone(mocks.state),
    save: (_key, state) => {
      mocks.state = structuredClone(state);
    },
  }),
}));
vi.mock('../lib/github.mjs', () => ({
  isPaused: () => false,
  openPulls: mocks.pulls,
  quickCheck: vi.fn(),
  fullCheck: vi.fn(),
  pullReview: vi.fn(),
}));
vi.mock('../lib/sh.mjs', () => ({ json: () => [] }));
vi.mock('../lib/repairCoverage.mjs', () => ({ expandsTestExclusions: mocks.exclusions }));
vi.mock('../lib/pull.mjs', () => ({ publish: mocks.publish }));
vi.mock('../lib/worktree.mjs', () => ({ openBranch: mocks.open, close: mocks.close }));
vi.mock('../lib/workRecovery.mjs', () => ({
  recoveryFor: () => null,
  saveRecovery: vi.fn(),
  clearRecovery: vi.fn(),
}));
vi.mock('../lib/deliveryState.mjs', () => ({ hasPendingWorktree: () => false }));
vi.mock('./health.mjs', () => ({ measure: () => ({ mainRedSince: '2026-11-21T00:00:00Z' }) }));

const now = Date.UTC(2026, 10, 22, 16);
const previous = now - 3 * 60 * 60_000;
const log = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  mocks.state = { stalledSince: now - 60 * 60_000, lastCallAt: previous };
  mocks.open.mockReturnValue({ dir: '.', branch: 'loop/repair/doctor' });
  mocks.pulls.mockReturnValue([]);
  mocks.exclusions.mockReturnValue(false);
  mocks.publish.mockReturnValue(null);
  mocks.repairs.mockReturnValue([]);
  mocks.retained.mockReturnValue(null);

  const exists = fs.existsSync.bind(fs);

  vi.spyOn(fs, 'existsSync').mockImplementation((file) => (file === LOGS ? false : exists(file)));
  mocks.agent.mockImplementation(({ onStart }) => {
    onStart(Date.now());

    return { ok: false, error: 'investigation failed' };
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('doctor capacity recovery', () => {
  it('keeps the prior cooldown after a capacity wait and investigates on its next scheduled visit', () => {
    mocks.agent.mockImplementationOnce(() => {
      throw new UsageLimit(now + 86_400_000);
    });

    expect(() => doctor({ log })).toThrow(UsageLimit);
    expect(mocks.state.lastCallAt).toBe(previous);
    expect(mocks.close).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10 * 60_000);
    doctor({ log });
    expect(mocks.agent).toHaveBeenCalledTimes(2);
    expect(mocks.state.lastCallAt).toBe(now + 10 * 60_000);
  });

  it('does not consume cooldown when preparing its GitHub evidence fails', () => {
    mocks.pulls.mockImplementationOnce(() => {
      throw new Error('GitHub unavailable');
    });

    expect(() => doctor({ log })).toThrow('GitHub unavailable');
    expect(mocks.agent).not.toHaveBeenCalled();
    expect(mocks.state.lastCallAt).toBe(previous);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('keeps the two-hour cooldown after an admitted investigation returns a failure', () => {
    doctor({ log });
    expect(mocks.state.lastCallAt).toBe(now);
    vi.advanceTimersByTime(10 * 60_000);
    doctor({ log });
    expect(mocks.agent).toHaveBeenCalledOnce();
    expect(log).toHaveBeenLastCalledWith('watching');
  });

  it('retains cooldown when an admitted provider throws', () => {
    mocks.agent.mockImplementationOnce(({ onStart }) => {
      onStart(Date.now());

      throw new Error('provider failed');
    });
    expect(() => doctor({ log })).toThrow('provider failed');
    expect(mocks.state.lastCallAt).toBe(now);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});

it('refuses a doctor proposal that changes the quarantine list before publication', () => {
  mocks.agent.mockReturnValue({ ok: true, output: { changed: true } });
  mocks.exclusions.mockReturnValue(true);
  doctor({ log });
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(log).toHaveBeenLastCalledWith(expect.stringMatching(/quarantine/));
});

it('publishes a doctor source repair without changing test exclusions', () => {
  mocks.agent.mockReturnValue({ ok: true, output: { changed: true } });
  doctor({ log });
  expect(mocks.publish).toHaveBeenCalledOnce();
  expect(mocks.close).toHaveBeenCalledOnce();
});

it('includes unpublished repair work without delaying the admitted investigation', () => {
  mocks.repairs.mockReturnValue([{ worker: 'repair-1', worktree: 'retained-repair', handoff: 'camera diagnostic' }]);
  doctor({ log });
  expect(mocks.agent).toHaveBeenCalledOnce();
  expect(mocks.agent.mock.calls[0][0].prompt).toContain('camera diagnostic');
  expect(mocks.agent.mock.calls[0][0].prompt).toContain('retained-repair');
  expect(mocks.state.lastCallAt).toBe(now);
});

it('delivers completed repair findings on its existing cadence without repeating the repair session', () => {
  mocks.retained.mockReturnValue({
    worktree: 'completed-investigation',
    reason: 'Failures remain unresolved',
    handoff: 'scratch/diagnostics/collected-report.json',
  });
  doctor({ log });
  expect(mocks.agent).toHaveBeenCalledOnce();
  expect(mocks.agent.mock.calls[0][0].prompt).toContain('Failures remain unresolved');
  expect(mocks.agent.mock.calls[0][0].prompt).toContain('scratch/diagnostics/collected-report.json');
  expect(mocks.agent.mock.calls[0][0].prompt).toContain('without changing its worktree');
  expect(mocks.state.lastCallAt).toBe(now);
  vi.advanceTimersByTime(10 * 60_000);
  doctor({ log });
  expect(mocks.agent).toHaveBeenCalledOnce();
});
