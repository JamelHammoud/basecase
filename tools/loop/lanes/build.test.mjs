import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-builder-'));
const calls = vi.hoisted(() => ({
  checkedRun: vi.fn(),
  openBranch: vi.fn(),
  close: vi.fn(),
  release: vi.fn(),
  refresh: vi.fn(() => 'Refreshed main inputs.'),
  publish: vi.fn(),
  signature: 'source-a',
  steps: [],
}));

vi.stubEnv('BASECASE_LOOP_DIR', directory);
vi.mock('../lib/agent.mjs', () => ({ CHANGE_SCHEMA: {} }));
vi.mock('../lib/claim.mjs', () => ({ claim: () => calls.release }));
vi.mock('../lib/github.mjs', () => ({
  closeIssue: vi.fn(),
  commentOnIssue: vi.fn(),
  editIssueLabels: (number, { add = [], remove = [] }) => {
    const step = calls.steps.find((issue) => issue.number === number);

    step.labels = [...step.labels.filter((label) => !remove.includes(label.name)), ...add.map((name) => ({ name }))];
  },
  hasLabel: (issue, name) => issue.labels.some((label) => label.name === name),
  issues: (name) => calls.steps.filter((issue) => issue.labels.some((label) => label.name === name)),
  openPulls: () => [],
}));
vi.mock('../lib/preflight.mjs', () => ({ checkedRun: calls.checkedRun }));
vi.mock('../lib/pull.mjs', () => ({ publish: calls.publish }));
vi.mock('../lib/stepPulls.mjs', () => ({ stepPullIndex: () => new Map(), stepStatus: () => 'none' }));
vi.mock('../lib/taskInputs.mjs', () => ({ taskInputSignature: () => calls.signature }));
vi.mock('../lib/worktree.mjs', () => ({ openBranch: calls.openBranch, close: calls.close }));
vi.mock('../lib/workRecovery.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  refreshRecovery: calls.refresh,
}));

const { default: build } = await import('./build.mjs');
const { recoveryFor, saveRecovery } = await import('../lib/workRecovery.mjs');
const { recordDecline } = await import('../lib/stepState.mjs');
const { completeDelivery, hasPendingWorktree, saveDelivery } = await import('../lib/deliveryState.mjs');

const queuedStep = (number) => ({
  number,
  title: 'Build the feature',
  body: 'Requires: repository\nInputs: `src/cameras/`',
  author: { login: 'JamelHammoud' },
  labels: [{ name: 'loop:next' }],
  createdAt: '2026-01-01T00:00:00Z',
});

afterEach(() => {
  vi.clearAllMocks();
  calls.publish.mockReset();
});
afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('builder publication recovery', () => {
  it('bounds repeated publication failures for unchanged inputs', () => {
    const worktree = { dir: directory, branch: 'loop/build/52-feature' };
    const session = { provider: 'codex', id: 'publication-thread' };
    const failure = new Error('Commit hook failed.');

    calls.steps = [queuedStep(52)];
    calls.openBranch.mockReturnValue(worktree);
    calls.checkedRun.mockReturnValue({
      ok: true,
      session,
      output: { changed: true, title: 'Feature', kind: 'feature' },
    });
    calls.publish.mockImplementation(() => {
      throw failure;
    });

    for (let attempt = 0; attempt < 2; attempt++) expect(() => build({ log: vi.fn(), slot: 1 })).toThrow(failure);

    build({ log: vi.fn(), slot: 1 });

    expect(calls.checkedRun).toHaveBeenCalledTimes(2);
    expect(calls.openBranch).toHaveBeenCalledOnce();
    expect(recoveryFor(52)).toMatchObject({ attempts: 1, session, ...worktree });
  });

  it('hands prepared publication failures to delivery without retaining another model recovery', () => {
    const worktree = { dir: directory, branch: 'loop/build/53-feature' };
    const session = { provider: 'codex', id: 'delivery-thread' };
    const failure = new Error('GitHub push failed.');

    calls.steps = [queuedStep(53)];
    calls.openBranch.mockReturnValue(worktree);
    calls.checkedRun.mockReturnValue({
      ok: true,
      session,
      output: { changed: true, title: 'Feature', kind: 'feature' },
    });
    calls.publish.mockImplementationOnce(() => {
      saveDelivery({ ...worktree, body: 'Closes #53.' });

      throw failure;
    });

    expect(() => build({ log: vi.fn(), slot: 1 })).toThrow(failure);
    expect(recoveryFor(53)).toBeNull();
    expect(hasPendingWorktree(directory)).toBe(true);

    build({ log: vi.fn(), slot: 1 });

    expect(calls.checkedRun).toHaveBeenCalledOnce();
    completeDelivery(worktree.branch);
  });

  it('retains completed work after a commit failure and resumes with the failure details', () => {
    const worktree = { dir: directory, branch: 'loop/build/51-feature' };
    const session = { provider: 'codex', id: 'completed-thread' };
    const failure = new Error('Commit hook rejected a fixture path.');

    calls.steps = [queuedStep(51)];
    calls.openBranch.mockReturnValue(worktree);
    calls.checkedRun.mockReturnValue({
      ok: true,
      session,
      output: { changed: true, title: 'Feature', kind: 'feature' },
    });
    calls.publish.mockImplementationOnce(() => {
      throw failure;
    });
    calls.close.mockImplementationOnce(() => {
      expect(recoveryFor(51)).toMatchObject({ session, ...worktree });
    });

    expect(() => build({ log: vi.fn(), slot: 1 })).toThrow(failure);
    expect(calls.steps[0].labels).toEqual([{ name: 'loop:next' }]);
    expect(recoveryFor(51)).toMatchObject({ session, reason: String(failure), ...worktree });

    build({ log: vi.fn(), slot: 1 });

    expect(calls.checkedRun.mock.calls[1][0]).toMatchObject({
      continuation: session,
      prompt: expect.stringContaining(failure.message),
    });
    expect(calls.openBranch).toHaveBeenCalledOnce();
    expect(calls.release).toHaveBeenCalledTimes(2);
    expect(recoveryFor(51)).toBeNull();
  });
});

describe('builder recovery attempts', () => {
  it('returns a task immediately after setup fails, then retries it without waiting for orphan recovery', () => {
    const failure = new Error('fetch failed');
    const worktree = { dir: directory, branch: 'loop/build/48-feature' };

    calls.steps = [queuedStep(48)];
    calls.openBranch
      .mockImplementationOnce(() => {
        throw failure;
      })
      .mockReturnValue(worktree);
    calls.checkedRun.mockReturnValue({ ok: false, error: 'task stopped' });

    expect(() => build({ log: vi.fn(), slot: 1 })).toThrow(failure);
    expect(calls.steps[0].labels).toEqual([{ name: 'loop:next' }]);
    expect(calls.checkedRun).not.toHaveBeenCalled();
    expect(calls.close).not.toHaveBeenCalled();
    expect(calls.release).toHaveBeenCalledOnce();

    build({ log: vi.fn(), slot: 1 });

    expect(calls.openBranch).toHaveBeenCalledTimes(2);
    expect(calls.checkedRun).toHaveBeenCalledOnce();
    expect(calls.close).toHaveBeenCalledWith(worktree);
  });

  it('stops after its recovery fails without returning a new session', () => {
    const worktree = { dir: directory, branch: 'loop/build/42-feature' };
    const session = { provider: 'codex', id: 'saved-thread' };

    calls.steps = [queuedStep(42)];
    calls.openBranch.mockReturnValue(worktree);
    calls.checkedRun
      .mockReturnValueOnce({ ok: false, session, error: 'process stopped' })
      .mockReturnValue({ ok: false, error: 'process unavailable' });

    for (let attempt = 0; attempt < 3; attempt++) build({ log: vi.fn(), slot: 1 });

    expect(calls.checkedRun).toHaveBeenCalledTimes(2);
    expect(calls.checkedRun.mock.calls[1][0].continuation).toEqual(session);
    expect(calls.openBranch).toHaveBeenCalledOnce();
    expect(recoveryFor(42)).toMatchObject({ attempts: 1, session, ...worktree });
    expect(calls.refresh).not.toHaveBeenCalled();
  });

  it('refreshes changed inputs before resuming the retained session', () => {
    const worktree = { dir: directory, branch: 'loop/build/43-feature' };
    const session = { provider: 'codex', id: 'retained-thread' };
    const recovery = saveRecovery(43, { worktree, session, inputSignature: 'source-a' });

    calls.steps = [queuedStep(43)];
    calls.signature = 'source-b';
    calls.checkedRun.mockReturnValue({ ok: false, session, error: 'process stopped' });
    build({ log: vi.fn(), slot: 1 });

    expect(calls.refresh).toHaveBeenCalledWith(recovery);
    expect(calls.checkedRun.mock.calls[0][0]).toMatchObject({
      cwd: directory,
      continuation: session,
      prompt: expect.stringContaining('Refreshed main inputs.'),
    });
    expect(calls.openBranch).not.toHaveBeenCalled();
  });

  it('preserves a session from a thrown preflight correction failure', () => {
    const worktree = { dir: directory, branch: 'loop/build/44-feature' };
    const session = { provider: 'codex', id: 'preflight-thread' };
    const failure = Object.assign(new Error('provider unavailable'), { session });

    calls.steps = [queuedStep(44)];
    calls.openBranch.mockReturnValue(worktree);
    calls.checkedRun.mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => build({ log: vi.fn(), slot: 1 })).toThrow(failure);
    expect(recoveryFor(44)).toMatchObject({ session, ...worktree });
    expect(calls.release).toHaveBeenCalledOnce();
    expect(calls.steps[0].labels).toEqual([{ name: 'loop:next' }]);
  });
});

describe('builder capability discoveries', () => {
  it('does not rediscover unavailable hardware after source changes and reopens an edited task immediately', () => {
    const worktree = { dir: directory, branch: 'loop/build/49-feature' };

    calls.steps = [queuedStep(49)];
    calls.signature = 'source-a';
    calls.openBranch.mockReturnValue(worktree);
    calls.checkedRun.mockReturnValue({ ok: true, output: { changed: false, notes: 'Requires: physical-robot' } });
    build({ log: vi.fn(), slot: 1 });
    calls.signature = 'source-b';
    build({ log: vi.fn(), slot: 1 });

    expect(calls.checkedRun).toHaveBeenCalledOnce();
    expect(calls.steps[0].labels).toEqual([{ name: 'loop:blocked' }]);

    calls.steps[0].body += '\nVerify with the existing emulator instead of physical hardware.';
    calls.checkedRun.mockReturnValue({ ok: false, error: 'stopped' });
    build({ log: vi.fn(), slot: 1 });

    expect(calls.checkedRun).toHaveBeenCalledTimes(2);
  });
});

describe('builder task readiness', () => {
  it('keeps current declared dependencies blocking after declined inputs change', () => {
    const step = { ...queuedStep(45), body: `${queuedStep(45).body}\nDepends on #46.` };
    const dependency = {
      ...queuedStep(46),
      body: 'Requires: physical-robot\nInputs: `src/cameras/`',
      labels: [{ name: 'loop:blocked' }],
    };

    calls.steps = [step, dependency];
    calls.signature = 'changed-source';
    recordDecline(45, { now: Date.now(), waitFor: [], inputSignature: 'old-source' });
    build({ log: vi.fn(), slot: 1 });

    expect(calls.checkedRun).not.toHaveBeenCalled();
    expect(calls.openBranch).not.toHaveBeenCalled();

    calls.steps = [step];
    calls.openBranch.mockReturnValue({ dir: directory, branch: 'loop/build/45-feature' });
    calls.checkedRun.mockReturnValue({ ok: true, output: { changed: false, notes: 'Needs a source change.' } });
    build({ log: vi.fn(), slot: 1 });

    expect(calls.checkedRun).toHaveBeenCalledOnce();
  });

  it('blocks a legacy task requiring unavailable hardware before opening a worktree', () => {
    calls.steps = [{ ...queuedStep(47), body: 'Requires: physical-robot\nInputs: `src/cameras/`' }];
    build({ log: vi.fn(), slot: 1 });

    expect(calls.steps[0].labels).toEqual([{ name: 'loop:blocked' }]);
    expect(calls.checkedRun).not.toHaveBeenCalled();
    expect(calls.openBranch).not.toHaveBeenCalled();
  });

  it('blocks legacy Windows diagnostics that only declare CI before opening a worktree', () => {
    calls.steps = [{ ...queuedStep(50), body: 'Requires: windows-ci\nCapture Windows process traces.' }];
    build({ log: vi.fn(), slot: 1 });

    expect(calls.steps[0].labels).toEqual([{ name: 'loop:blocked' }]);
    expect(calls.checkedRun).not.toHaveBeenCalled();
    expect(calls.openBranch).not.toHaveBeenCalled();
  });
});
