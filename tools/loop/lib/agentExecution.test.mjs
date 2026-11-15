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
vi.mock('./sessionJournal.mjs', () => ({ recordSession: mocks.journal }));
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
    mocks.codexHeld = { until: Date.now() + 60_000 };
    mocks.quota = { at: Date.now(), windows: [{ minutes: 10080, used: 5, reset: Date.now() + 86_400_000 }] };
    mocks.codex.mockReturnValue({ ok: true, output: { changed: true } });

    expect(runAgent(task)).toMatchObject({ ok: true, provider: 'codex' });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
