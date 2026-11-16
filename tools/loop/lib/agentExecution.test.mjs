import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  codex: vi.fn(),
  claude: vi.fn(),
  reserve: vi.fn(),
  journal: vi.fn(() => 'journal'),
  codexHeld: null,
  claudeHeld: null,
  quota: { windows: [] },
}));

vi.mock('./codex.mjs', () => ({ runCodex: mocks.codex }));
vi.mock('./claude.mjs', () => ({
  runClaude: mocks.claude,
  withoutGithub: (fn) => fn({ GH_TOKEN: '' }),
  sandboxArgs: () => [],
}));
vi.mock('./quota.mjs', () => ({ quotaSnapshot: () => mocks.quota, reserveOverflow: mocks.reserve }));
vi.mock('./sessionJournal.mjs', async (original) => ({ ...(await original()), recordSession: mocks.journal }));
vi.mock('./usage.mjs', () => ({
  codexPause: () => mocks.codexHeld,
  pause: () => mocks.claudeHeld,
  isActive: (state) => Boolean(state && state.until > Date.now()),
  resumeCodex: vi.fn(),
  startCodexPause: vi.fn(),
  startPause: vi.fn(),
  UsageLimit: class extends Error {
    constructor(until) {
      super('limited');
      this.until = until;
    }
  },
}));

const { runAgent } = await import('./agent.mjs');
const { resumeCodex } = await import('./usage.mjs');
const task = { cwd: '.', name: 'build', system: 'Implement the requested change.', prompt: 'Build it.', schema: {} };

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.codexHeld = null;
  mocks.claudeHeld = null;
  mocks.quota = { windows: [] };
});

describe('agent routing', () => {
  it('uses Codex even when Claude has available capacity and records start and completion', () => {
    mocks.codex.mockReturnValue({ ok: true, output: { changed: true } });

    expect(runAgent(task)).toMatchObject({ ok: true, provider: 'codex' });
    expect(mocks.claude).not.toHaveBeenCalled();
    expect(mocks.journal.mock.calls[0][0].state).toBe('running');
    expect(mocks.journal.mock.calls[1][0]).toMatchObject({ id: 'journal', state: 'completed' });
  });

  it('keeps ordinary failures ordinary instead of repeating the task on another provider', () => {
    mocks.codex.mockReturnValue({ ok: false, error: 'test failed' });

    expect(runAgent(task).ok).toBe(false);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.claude).not.toHaveBeenCalled();
  });

  it('preserves a newer primary rejection recorded while another session was running', () => {
    mocks.codex.mockImplementationOnce(() => {
      mocks.codexHeld = { until: Date.now() + 60_000, observedAt: Date.now() };

      return { ok: true, output: { changed: true } };
    });

    expect(runAgent(task)).toMatchObject({ ok: true, provider: 'codex' });
    expect(resumeCodex).not.toHaveBeenCalled();
  });

  it('uses protected overflow only for a real limit and releases its reservation', () => {
    const release = vi.fn();

    mocks.reserve.mockReturnValue(release);
    mocks.codex.mockReturnValue({ ok: false, limited: { until: Date.now() + 60_000 } });
    mocks.claude.mockReturnValue({ ok: true, output: { changed: true } });

    expect(runAgent(task)).toMatchObject({ provider: 'claude', overflow: true });
    expect(release).toHaveBeenCalledOnce();
  });

  it('protects personal work when overflow cannot be reserved', () => {
    mocks.codexHeld = { until: Date.now() + 60_000 };
    mocks.reserve.mockReturnValue(null);

    expect(() => runAgent(task)).toThrow('limited');
    expect(mocks.claude).not.toHaveBeenCalled();
  });

  it('uses restored Codex allowance instead of waiting for an obsolete hold', () => {
    mocks.codexHeld = { until: Date.now() + 60_000, since: Date.now() - 1000 };
    mocks.quota = { at: Date.now(), windows: [{ minutes: 10080, used: 5, reset: Date.now() + 86_400_000 }] };
    mocks.codex.mockReturnValue({ ok: true, output: { changed: true } });

    expect(runAgent(task)).toMatchObject({ ok: true, provider: 'codex' });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('does not clear a real limit using quota cached before the rejection', () => {
    const now = Date.now();
    const release = vi.fn();

    mocks.codexHeld = { until: now + 60_000, since: now - 10_000, observedAt: now };
    mocks.quota = { at: now - 1000, windows: [{ minutes: 10080, used: 5, reset: now + 86_400_000 }] };
    mocks.reserve.mockReturnValue(release);
    mocks.claude.mockReturnValue({ ok: true, output: { changed: true } });

    expect(runAgent(task)).toMatchObject({ provider: 'claude', overflow: true });
    expect(mocks.codex).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it('keeps explicit Claude selection behind protected overflow admission', () => {
    vi.stubEnv('BASECASE_LOOP_PROVIDER', 'claude');
    mocks.reserve.mockReturnValue(null);

    expect(() => runAgent(task)).toThrow('limited');
    expect(mocks.codex).not.toHaveBeenCalled();
    expect(mocks.claude).not.toHaveBeenCalled();
  });

  it('keeps scoped research on the runner that enforces its tool allowlist', () => {
    const release = vi.fn();
    const sandbox = { tools: ['Read', 'WebSearch'], allow: ['Read', 'WebSearch'] };

    mocks.reserve.mockReturnValue(release);
    mocks.claude.mockReturnValue({ ok: true, output: { changed: false } });

    expect(runAgent({ ...task, sandbox })).toMatchObject({ provider: 'claude', overflow: true });
    expect(mocks.codex).not.toHaveBeenCalled();
    expect(mocks.claude.mock.calls[0][0].sandbox).toEqual(sandbox);
    expect(release).toHaveBeenCalledOnce();
  });

  it('never widens research permissions when protected capacity is unavailable', () => {
    mocks.reserve.mockReturnValue(null);

    expect(() => runAgent({ ...task, sandbox: { tools: ['Read'], allow: ['Read'] } })).toThrow('limited');
    expect(mocks.codex).not.toHaveBeenCalled();
    expect(mocks.claude).not.toHaveBeenCalled();
  });
});

it('journals the selected product kind and originating refinement worker before and after execution', () => {
  vi.stubEnv('BASECASE_LOOP_LANE', 'refine');
  mocks.codex.mockReturnValue({ ok: true, output: { changed: true, kind: 'integration' } });
  runAgent({ ...task, task: 'step-10', taskKind: 'integration', worker: 'refine-2' });

  for (const [entry] of mocks.journal.mock.calls) {
    expect(entry).toMatchObject({
      name: 'build',
      lane: 'build',
      task: 'step-10',
      taskKind: 'integration',
      worker: 'refine-2',
    });
  }
});

it('keeps the same deadline and journals incomplete work without claiming task completion', () => {
  const outcome = {
    status: 'incomplete',
    reason: 'Acceptance checks remain',
    evidence: ['scratch/task-handoff.json'],
    dependencies: [],
    capabilities: [],
  };
  const deadlineAt = Date.now() + 1000;

  mocks.codex.mockReturnValue({ ok: true, output: { changed: false, outcome } });
  runAgent({ ...task, deadlineAt });
  expect(mocks.codex.mock.calls[0][0]).toMatchObject({ deadlineAt });
  expect(mocks.codex.mock.calls[0][0].hours).toBeLessThanOrEqual(1 / 3600);
  expect(mocks.journal.mock.calls[1][0].result).toMatchObject({ changed: false, outcome });
  expect(runAgent({ ...task, deadlineAt: Date.now() - 1 })).toMatchObject({
    ok: false,
    error: 'Task execution deadline exhausted',
  });
  expect(mocks.codex).toHaveBeenCalledOnce();
});

it('preserves the interrupted primary session when protected overflow cannot start', () => {
  const session = { provider: 'codex', id: 'interrupted-feature' };

  mocks.codex.mockReturnValue({ ok: false, session, limited: { until: Date.now() + 60_000 } });
  mocks.reserve.mockReturnValue(null);

  let failure;

  try {
    runAgent(task);
  } catch (error) {
    failure = error;
  }

  expect(failure).toMatchObject({ session });
  expect(mocks.codex).toHaveBeenCalledOnce();
  expect(mocks.claude).not.toHaveBeenCalled();
});

it.each([false, true])('retains the primary session when overflow returns ok=%s without a session', (ok) => {
  const session = { provider: 'codex', id: 'interrupted-feature' };
  const release = vi.fn();

  mocks.codex.mockReturnValue({ ok: false, session, limited: { until: Date.now() + 60_000 } });
  mocks.reserve.mockReturnValue(release);
  mocks.claude.mockReturnValue({ ok, output: { changed: false, outcome: { status: 'incomplete' } } });

  expect(runAgent(task)).toMatchObject({ ok, session, provider: 'claude', overflow: true });
  expect(release).toHaveBeenCalledOnce();
});
