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
vi.mock('../lib/pull.mjs', () => ({ publish: vi.fn() }));
vi.mock('../lib/stepPulls.mjs', () => ({ stepPullIndex: () => new Map(), stepStatus: () => 'none' }));
vi.mock('../lib/taskInputs.mjs', () => ({ taskInputSignature: () => calls.signature }));
vi.mock('../lib/worktree.mjs', () => ({ openBranch: calls.openBranch, close: calls.close }));
vi.mock('../lib/workRecovery.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  refreshRecovery: calls.refresh,
}));

const { default: build } = await import('./build.mjs');
const { recoveryFor, saveRecovery } = await import('../lib/workRecovery.mjs');

const queuedStep = (number) => ({
  number,
  title: 'Build the feature',
  body: 'Requires: repository\nInputs: `src/cameras/`',
  author: { login: 'JamelHammoud' },
  labels: [{ name: 'loop:next' }],
  createdAt: '2026-01-01T00:00:00Z',
});

afterEach(() => vi.clearAllMocks());
afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('builder recovery attempts', () => {
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
});
