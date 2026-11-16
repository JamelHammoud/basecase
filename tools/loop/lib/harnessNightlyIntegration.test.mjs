import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { comparison } from '../../../bench/compare/fixtures/efficiency.mjs';

const f = vi.hoisted(() => ({
  dir: '',
  state: null,
  candidate: {
    source: 'tune-waste',
    ref: 'tune-waste/repeated-read/get_scene',
    text: 'repeated-read: get_scene',
    measured: { frequency: 4, milliseconds: 500 },
    evidence: ['week/A1'],
  },
  selection: { provider: 'codex', model: 'gpt-6.1-sol', effort: 'medium' },
  benchmarkSelection: vi.fn(),
  runAgent: vi.fn(),
  run: vi.fn(),
  close: vi.fn(),
  publish: vi.fn(),
}));

vi.mock('./paths.mjs', () => ({
  CODE_ROOT: '.',
  get HOME_CHECKOUT() {
    return f.dir;
  },
  get LOOP_DIR() {
    return f.dir;
  },
}));
vi.mock('./benchmarkPolicy.mjs', () => ({ benchmarkSelection: f.benchmarkSelection }));
vi.mock('./agent.mjs', () => ({ CHANGE_SCHEMA: {}, runAgent: f.runAgent }));
vi.mock('./sh.mjs', () => ({ run: f.run }));
vi.mock('./pull.mjs', () => ({ publish: f.publish }));
vi.mock('./worktree.mjs', () => ({ openBranch: () => ({ dir: f.dir, branch: 'loop/harness/test' }), close: f.close }));
vi.mock('./capacity.mjs', () => ({ measure: () => ({ sessions: 0, loadPerCore: 0.1 }), capacityHold: () => null }));
vi.mock('./locks.mjs', () => ({ heldLocks: () => ['nightly-1'] }));
vi.mock('../../../verify/lib/quiet.mjs', () => ({ quietRequested: () => false }));
vi.mock('./store.mjs', () => ({
  store: () => ({
    get: () => structuredClone(f.state),
    save: (_, state) => (f.state = state),
    update: (_, update) => (f.state = { ...f.state, ...update(f.state) }),
  }),
}));

const argvValue = (args, key) => args[args.indexOf(key) + 1];
const outcome = () => ({
  provider: f.selection.provider,
  effort: f.selection.effort,
  labels: ['working tree', 'main'],
  resolved: Array.from({ length: 2 }, () => ({
    id: f.selection.model,
    arg: f.selection.model,
    expectServed: f.selection.model.replace(/\./g, '-'),
  })),
  stats: {
    paired: Array.from({ length: 5 }, (_, i) => ({ task: `A${i}`, a: 1, b: 0 })),
    stopCi: [1, 1],
    models: [
      { meanPassRate: 1, errors: 0 },
      { meanPassRate: 0, errors: 0 },
    ],
  },
  plan: { stop: 'winner', rounds: 1, tasks: 5 },
  results: Array.from({ length: 10 }, (_, i) => ({
    task: `A${i % 5}`,
    status: i < 5 ? 'pass' : 'fail',
    model: i < 5 ? 'working tree' : 'main',
    seed: 1,
    provider: f.selection.provider,
    servedBy: f.selection.model,
  })),
});

function writeComparison(args, result = outcome()) {
  const dir = path.join(argvValue(args, '--runs-dir'), argvValue(args, '--run'));

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(result));
  fs.writeFileSync(
    path.join(dir, 'report.md'),
    `${args.includes('--tune') ? 'Tune' : 'Held-out'}: total work per successful task, failed attempts included.`,
  );
}

function shell(_, args) {
  if (args[0] === '--input-type=module')
    return {
      ok: true,
      out: JSON.stringify([{ source: 'review', ref: '#1', text: 'Unmeasured finding' }, f.candidate]),
    };

  if (args[0] === 'rev-parse') return { ok: true, out: 'abc123' };

  if (args.includes('--name-only')) return { ok: true, out: 'electron/cad-agent-prompt.mjs\0' };

  if (args[0] === 'ls-files') return { ok: true, out: '' };

  if (args[0] === 'diff') return { ok: true, out: 'a production patch' };

  if (args[0] === 'patch-id') return { ok: true, out: 'patch-one abc123' };

  if (args[0] === 'bench/compare.mjs') {
    writeComparison(args);

    return { ok: true, out: '' };
  }

  throw new Error(`Unexpected shell arguments: ${args.join(' ')}`);
}

const commands = () => f.run.mock.calls.filter(([, args]) => args[0] === 'bench/compare.mjs');

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
  f.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nightly-harness-test-'));
  f.state = { entries: [], releases: [], days: [], pending: null };
  fs.mkdirSync(path.join(f.dir, 'bench'));
  f.benchmarkSelection.mockReturnValue(f.selection);
  f.runAgent.mockReturnValue({ ok: true, output: { changed: true, title: 'Seat screw heads' } });
  f.publish.mockReturnValue('https://example.com/pull/1');
  f.run.mockImplementation(shell);
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(f.dir, { recursive: true, force: true });
});

it('drives the nightly entry through proposal, both measurements, reporting and cleanup on Codex', async () => {
  const { nightlyHarness } = await import('./harnessNightly.mjs');

  nightlyHarness({ log: vi.fn(), release: 'v0.2.1' });
  expect(f.runAgent).toHaveBeenCalledOnce();
  expect(f.runAgent.mock.calls[0][0].prompt).toContain(JSON.stringify(f.candidate.measured));
  expect(f.runAgent.mock.calls[0][0].prompt).toContain(f.candidate.ref);
  expect(commands()).toHaveLength(2);

  for (const [, args, options] of commands()) {
    expect(argvValue(args, '--provider')).toBe('codex');
    expect(argvValue(args, '--model')).toBe(f.selection.model);
    expect(argvValue(args, '--effort')).toBe('medium');
    expect(args).toContain('--loop-allowance');
    expect(options.timeout).toBeLessThan(30 * 60_000);
  }

  expect(commands()[0][1]).toContain('--tune');
  expect(commands()[1][1]).toContain('--heldout');
  expect(f.state.entries.at(-1)).toMatchObject({ verdict: 'kept', waste: f.candidate.measured });
  expect(f.state.entries.at(-1).evidence).toContain('week/A1');
  expect(f.state.entries.at(-1).lesson).toContain('Tune: total work per successful task');
  expect(f.state.entries.at(-1).lesson).toContain('Held-out: total work per successful task');
  expect(f.publish).toHaveBeenCalledOnce();
  expect(f.close).toHaveBeenCalledOnce();
});

it('records protected overflow refusal without proposing, measuring or publishing', async () => {
  f.benchmarkSelection.mockImplementation(() => {
    throw new Error('Protected Claude allowance unavailable');
  });

  const { nightlyHarness } = await import('./harnessNightly.mjs');

  nightlyHarness({ log: vi.fn(), release: 'v0.2.1' });
  expect(f.runAgent).not.toHaveBeenCalled();
  expect(commands()).toHaveLength(0);
  expect(f.publish).not.toHaveBeenCalled();
  expect(f.state.entries.at(-1)).toMatchObject({ verdict: 'error' });
  expect(f.state.entries.at(-1).lesson).toContain('Protected Claude allowance unavailable');
  expect(f.close).toHaveBeenCalledOnce();
});

it.each(['responding model', 'mixed provider', 'changed effort', 'deadline', 'interrupted'])(
  'cleans up %s work without a winning claim',
  async (failure) => {
    f.run.mockImplementation((command, args) => {
      if (args[0] !== 'bench/compare.mjs') return shell(command, args);

      const result = outcome();

      if (failure === 'responding model') result.results[0].servedBy = 'another-model';

      if (failure === 'mixed provider') result.results[0].provider = 'claude';

      if (failure === 'changed effort') result.effort = 'high';

      if (failure === 'deadline') {
        vi.setSystemTime(Date.now() + 30 * 60_000);
        result.plan.stop = 'deadline';
      }

      if (failure === 'interrupted') return { ok: false, out: '', err: 'Comparison interrupted' };

      writeComparison(args, result);

      return { ok: true, out: '' };
    });

    const { nightlyHarness } = await import('./harnessNightly.mjs');

    nightlyHarness({ log: vi.fn(), release: 'v0.2.1' });
    expect(commands()).toHaveLength(1);
    expect(f.publish).not.toHaveBeenCalled();
    expect(f.state.entries.at(-1).verdict).not.toBe('kept');
    expect(f.close).toHaveBeenCalledOnce();
  },
);

it('keeps completed tune evidence when held-out confirmation is interrupted', async () => {
  let comparisons = 0;

  f.run.mockImplementation((command, args) => {
    if (args[0] !== 'bench/compare.mjs') return shell(command, args);

    comparisons++;

    if (comparisons === 2) {
      const partial = outcome();

      partial.results.pop();
      partial.plan.stop = 'error';
      writeComparison(args, partial);

      return { ok: false, out: '', err: 'Confirmation interrupted' };
    }

    return shell(command, args);
  });

  const { nightlyHarness } = await import('./harnessNightly.mjs');

  nightlyHarness({ log: vi.fn(), release: 'v0.2.1' });
  expect(commands()).toHaveLength(2);
  expect(f.publish).not.toHaveBeenCalled();
  expect(f.state.entries.at(-1).verdict).not.toBe('kept');
  expect(f.state.entries.at(-1).lesson).toContain('Tune comparison');
  expect(f.state.entries.at(-1).lesson).toContain('Held-out comparison');
  expect(f.close).toHaveBeenCalledOnce();
});

it.each(['win', 'regression', 'expired', 'interrupted'])(
  'classifies paired efficiency %s through the nightly publication boundary',
  async (scenario) => {
    f.run.mockImplementation((command, args) => {
      if (args[0] !== 'bench/compare.mjs') return shell(command, args);

      if (args.includes('--heldout') && scenario === 'interrupted')
        return { ok: false, out: '', err: 'Interrupted without report' };

      const result = comparison();

      if (args.includes('--heldout') && scenario === 'regression') result.results[0].checks[0].pass = false;

      if (args.includes('--heldout') && scenario === 'expired') vi.setSystemTime(Date.now() + 30 * 60_000);

      writeComparison(args, result);

      return { ok: true, out: '' };
    });

    const { nightlyHarness } = await import('./harnessNightly.mjs');

    nightlyHarness({ log: vi.fn(), release: 'v0.2.1' });
    expect(commands()).toHaveLength(2);
    expect(f.state.entries.at(-1).outcome).toBe(
      { win: 'efficiency-win', regression: 'loss', expired: 'incomplete', interrupted: 'incomplete' }[scenario],
    );
    expect(f.publish).toHaveBeenCalledTimes(scenario === 'win' ? 1 : 0);
    expect(f.state.entries.at(-1).lesson).toContain('Held-out comparison');
    expect(fs.readFileSync(path.join(f.dir, 'bench/experiments.md'), 'utf8')).toContain('Held-out comparison');
  },
);
