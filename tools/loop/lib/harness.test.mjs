import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readExperiments } from '../../../bench/experiments.mjs';
import { pullBody } from './pull.mjs';
import { experimentHold, runExperiment } from './harness.mjs';

const dirs = [];
const candidate = { key: 'candidate-one', source: 'micro', ref: 'week/A1', text: 'Screw heads are below their seats' };
const change = { changed: true, title: 'Seat screw heads', checked: 'fixture checks pass', summary: 'Seat heads' };
const outcome = (win = true) => ({
  labels: ['working tree', 'main'],
  resolved: Array.from({ length: 2 }, () => ({ id: 'opus', arg: 'claude-opus-5-5', expectServed: 'claude-opus-5-5' })),
  stats: {
    paired: Array.from({ length: 5 }, (_, i) => ({ task: `A${i}`, a: 1, b: 0 })),
    stopCi: win ? [1, 1] : [-1, 0],
    models: [
      { meanPassRate: 1, errors: 0 },
      { meanPassRate: 0, errors: 0 },
    ],
  },
  plan: { stop: win ? 'winner' : 'equivalent', rounds: 1, tasks: 5 },
  results: Array.from({ length: 10 }, (_, i) => ({
    task: `A${i % 5}`,
    status: i < 5 ? 'pass' : 'fail',
    model: i < 5 ? 'working tree' : 'main',
    seed: 1,
    servedBy: 'claude-opus-5-5',
  })),
  report: 'Before main: 0. After working tree: 1.',
});

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-harness-test-'));
  const ledger = path.join(dir, 'bench', 'experiments.md');
  const journal = [];

  dirs.push(dir);
  fs.mkdirSync(path.dirname(ledger));

  return {
    dir,
    ledger,
    journal,
    candidate,
    release: 'v0.2.1',
    now: () => 1_000,
    deps: {
      propose: vi.fn(() => ({ ok: true, output: change })),
      fingerprint: vi.fn(() => 'patch-one'),
      compare: vi.fn(() => outcome()),
      record: vi.fn((entry) => journal.push(entry)),
      publish: vi.fn(() => 'https://example.com/pull/1'),
      remaining: () => 1_700_000,
    },
  };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('nightly harness experiments', () => {
  it('records a held-out loss without publishing', () => {
    const f = fixture();

    f.deps.compare.mockReturnValueOnce(outcome()).mockReturnValueOnce(outcome(false));

    const result = runExperiment(f);

    expect(result.verdict).toBe('rejected');
    expect(f.deps.publish).not.toHaveBeenCalled();
    expect(f.journal.at(-1).verdict).toBe('rejected');
    expect(readExperiments(f.ledger).at(-1).lesson).toContain('rejected');
  });

  it('publishes only a complete held-out bootstrap win and includes before and after measurements', () => {
    const f = fixture();
    const result = runExperiment(f);

    expect(result.verdict).toBe('kept');
    expect(result.outcome).toBe('quality-win');
    expect(f.deps.compare.mock.calls.map(([options]) => options.split)).toEqual(['tune', 'heldout']);
    expect(f.deps.publish).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'harness', checked: change.checked }),
      expect.objectContaining({ weakness: candidate.text, measured: expect.stringContaining('Before main: 0.') }),
    );

    const [published, extra] = f.deps.publish.mock.calls[0];
    const body = pullBody(published, { branch: 'loop/harness/fixture', slug: 'example/studio', extra });
    const measured = body.split('## Measured\n\n')[1].split('\n## How it was checked')[0];

    expect(measured).toContain('Tune comparison');
    expect(measured).toContain('Held-out comparison');
    expect(measured).toContain('Before main: 0. After working tree: 1.');
    expect(body).toContain(`## Weakness\n\n${candidate.text}`);
    expect(readExperiments(f.ledger).at(-1).tags).toContain('fingerprint:patch-one');
    expect(f.journal.at(-1).verdict).toBe('kept');
  });

  it.each(['budget', 'error', 'unavailable', 'missing', 'few', 'incomplete', 'refused'])(
    'rejects %s measurements',
    (kind) => {
      const f = fixture();
      const heldout = outcome();

      if (kind === 'budget') heldout.plan.stop = 'deadline';

      if (kind === 'error') heldout.stats.models[0].errors = 1;

      if (kind === 'unavailable') heldout.results[0].status = 'unavailable';

      if (kind === 'missing') heldout.results.pop();

      if (kind === 'few') heldout.stats.paired.pop();

      if (kind === 'incomplete') heldout.plan.tasks = 6;

      if (kind === 'refused') delete heldout.results[0].servedBy;

      f.deps.compare.mockReturnValueOnce(outcome()).mockReturnValueOnce(heldout);
      runExperiment(f);
      expect(f.deps.publish).not.toHaveBeenCalled();
      expect(f.journal.at(-1).verdict).not.toBe('kept');
    },
  );

  it('does not measure a patch fingerprint already recorded in the durable journal', () => {
    const f = fixture();

    f.journal.push({ fingerprint: 'patch-one', verdict: 'rejected' });
    runExperiment(f);
    expect(f.deps.compare).not.toHaveBeenCalled();
    expect(f.deps.publish).not.toHaveBeenCalled();
  });

  it('keeps a failed comparison patch recorded so it cannot be measured again', () => {
    const f = fixture();

    f.deps.compare.mockImplementationOnce(() => {
      throw new Error('provider failed');
    });
    runExperiment(f);
    expect(f.journal.at(-1)).toMatchObject({ fingerprint: 'patch-one', verdict: 'error' });
    runExperiment(f);
    expect(f.deps.compare).toHaveBeenCalledOnce();
    expect(f.deps.publish).not.toHaveBeenCalled();
  });

  it('persists proposal errors and refuses a proposal that consumed the deadline', () => {
    const f = fixture();

    f.deps.propose.mockImplementation(() => {
      throw new Error('proposal failed');
    });
    runExperiment(f);
    expect(f.journal.at(-1).verdict).toBe('error');
    expect(readExperiments(f.ledger).at(-1).lesson).toContain('proposal failed');

    f.deps.propose.mockReturnValue({ ok: true, output: change });
    f.deps.remaining = () => 0;
    runExperiment(f);
    expect(f.deps.compare).not.toHaveBeenCalled();
    expect(f.journal.at(-1).verdict).toBe('budget');
  });

  it('flushes rejected journal entries into the next winning ledger without duplicating existing records', () => {
    const f = fixture();

    f.journal.push({
      candidate: 'earlier',
      fingerprint: 'earlier-patch',
      verdict: 'rejected',
      title: 'Earlier proposal',
      evidence: ['week/B1'],
      lesson: 'Rejected after measurement',
      at: '2026-11-14T01:00:00Z',
    });
    runExperiment(f);
    expect(readExperiments(f.ledger).map((entry) => entry.title)).toEqual(['Earlier proposal', change.title]);
  });
});

describe('quiet machine requirement', () => {
  it('permits only its own nightly lock with idle sessions and spare capacity', () => {
    const state = { locks: ['nightly-1'], quiet: false, sessions: 0, loadPerCore: 0.4 };

    expect(experimentHold(state)).toBeNull();
    expect(experimentHold({ ...state, locks: ['nightly-1', 'build-1'] })).toBeTruthy();
    expect(experimentHold({ ...state, quiet: true })).toBeTruthy();
    expect(experimentHold({ ...state, sessions: 1 })).toBeTruthy();
    expect(experimentHold({ ...state, loadPerCore: 2 })).toBeTruthy();
  });
});
