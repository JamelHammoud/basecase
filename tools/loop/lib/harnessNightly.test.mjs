import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runExperiment } from './harness.mjs';
import { run } from './sh.mjs';
import { nightlyHarness } from './harnessNightly.mjs';

const f = vi.hoisted(() => ({
  state: {},
  locks: [],
  quiet: false,
  sessions: 0,
  loadPerCore: 0,
  candidate: { key: 'candidate-one', ref: 'week/A1', text: 'Unseated screw heads' },
  open: vi.fn(),
  close: vi.fn(),
}));

vi.mock('./store.mjs', () => ({
  store: () => ({
    get: () => f.state,
    save: (_key, value) => {
      f.state = value;
    },
    update: (_key, change) => {
      f.state = { ...f.state, ...change(f.state) };
    },
  }),
}));
vi.mock('./benchmarkPolicy.mjs', () => ({
  benchmarkSelection: () => ({ provider: 'codex', model: 'gpt-6.1-sol', effort: 'medium' }),
}));
vi.mock('./locks.mjs', () => ({ heldLocks: () => f.locks }));
vi.mock('../../../verify/lib/quiet.mjs', () => ({ quietRequested: () => f.quiet }));
vi.mock('./capacity.mjs', async (original) => ({
  ...(await original()),
  measure: () => ({ sessions: f.sessions, loadPerCore: f.loadPerCore }),
}));
vi.mock('./harnessEvidence.mjs', () => ({ weekCandidates: () => [], chooseCandidate: () => f.candidate }));
vi.mock('../../../bench/experiments.mjs', () => ({ readExperiments: () => [] }));
vi.mock('./worktree.mjs', () => ({ openBranch: f.open, close: f.close }));
vi.mock('./sh.mjs', () => ({
  run: vi.fn((_command, args) => ({ out: args.includes('--input-type=module') ? '[]' : 'main-sha', ok: true })),
}));
vi.mock('./harness.mjs', async (original) => ({
  ...(await original()),
  runExperiment: vi.fn(() => ({ verdict: 'rejected' })),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  f.state = { entries: [], releases: [], days: [], pending: null };
  f.locks = ['nightly-1'];
  f.quiet = false;
  f.sessions = 0;
  f.loadPerCore = 0;
  f.open.mockReturnValue({ dir: process.cwd(), branch: 'loop/harness/fixture' });
});

describe('nightly harness scheduling', () => {
  it('starts nothing until a release has succeeded', () => {
    nightlyHarness({ log: vi.fn() });
    expect(f.open).not.toHaveBeenCalled();
    expect(runExperiment).not.toHaveBeenCalled();
  });

  it.each(['locks', 'quiet', 'sessions', 'load'])(
    'defers on %s and keeps the release pending for an idle run',
    (held) => {
      if (held === 'locks') f.locks.push('review-1');

      if (held === 'quiet') f.quiet = true;

      if (held === 'sessions') f.sessions = 1;

      if (held === 'load') f.loadPerCore = 2;

      nightlyHarness({ log: vi.fn(), release: 'v0.2.1' });
      expect(f.open).not.toHaveBeenCalled();
      expect(f.state.pending).toBe('v0.2.1');
      f.locks = ['nightly-1'];
      f.quiet = false;
      f.sessions = 0;
      f.loadPerCore = 0;
      nightlyHarness({ log: vi.fn() });
      expect(runExperiment).toHaveBeenCalledOnce();
      expect(f.close).toHaveBeenCalledOnce();
    },
  );

  it('durably claims the candidate before proposal and runs at most once per day', () => {
    runExperiment.mockImplementationOnce(() => {
      expect(f.state.entries[0].candidate).toBe('candidate-one');
      expect(f.state.entries[0].verdict).toBe('error');
      expect(f.state.pending).toBeNull();

      return { verdict: 'rejected' };
    });
    nightlyHarness({ log: vi.fn(), release: 'v0.2.1' });
    nightlyHarness({ log: vi.fn(), release: 'v0.2.1' });
    nightlyHarness({ log: vi.fn(), release: 'v0.2.2' });
    expect(runExperiment).toHaveBeenCalledOnce();
  });
});

it.each(['error', 'winner'])('keeps the report and rejects a failed process with a saved %s result', (stop) => {
  nightlyHarness({ log: vi.fn(), release: 'v0.2.1' });

  const { deps } = runExperiment.mock.calls[0][0];
  const result = {
    provider: 'codex',
    effort: 'medium',
    resolved: [{ arg: 'gpt-6.1-sol' }, { arg: 'gpt-6.1-sol' }],
    plan: { stop },
    results: [],
    error: 'Kernel preflight failed',
  };

  run.mockReturnValueOnce({ ok: false, err: 'exit 1' });
  vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  vi.spyOn(fs, 'readFileSync').mockImplementation((file) =>
    file.endsWith('results.json') ? JSON.stringify(result) : '# Partial report',
  );

  expect(deps.compare({ split: 'tune', milliseconds: 1000 })).toMatchObject({
    ...result,
    plan: { stop: 'error' },
    run: expect.stringContaining('-tune'),
    report: expect.stringContaining('# Partial report'),
  });
});
