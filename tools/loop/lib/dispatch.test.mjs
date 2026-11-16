import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  steps: [],
  statuses: new Map(),
  historyAvailable: true,
  execute: vi.fn(),
  publish: vi.fn(),
  fallback: vi.fn(),
}));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-dispatch-'));

vi.stubEnv('BASECASE_LOOP_DIR', directory);
vi.mock('./agent.mjs', () => ({ CHANGE_SCHEMA: {} }));
vi.mock('./github.mjs', () => ({
  issues: (label) => calls.steps.filter((step) => step.labels.some((entry) => entry.name === label)),
  hasLabel: (step, label) => step.labels.some((entry) => entry.name === label),
  openPulls: () => [],
  closeIssue: vi.fn(),
  commentOnIssue: vi.fn(),
  editIssueLabels: (number, { add = [], remove = [] }) => {
    const step = calls.steps.find((entry) => entry.number === number);

    step.labels = [...step.labels.filter((entry) => !remove.includes(entry.name)), ...add.map((name) => ({ name }))];
  },
}));
vi.mock('./stepPulls.mjs', () => ({
  stepPullIndex: (options) => (options?.fresh && !calls.historyAvailable ? null : calls.statuses),
  stepStatus: (index, n) => index.get(n) ?? 'none',
}));
vi.mock('./taskInputs.mjs', () => ({ taskInputSignature: () => 'inputs' }));
vi.mock('./preflight.mjs', () => ({ checkedRun: calls.execute }));
vi.mock('./pull.mjs', () => ({ publish: calls.publish, kindOf: () => 'refine', pullTitle: () => 'Refine: Test' }));
vi.mock('./worktree.mjs', () => ({
  openBranch: () => ({ dir: directory, branch: 'loop/build/1-test' }),
  close: vi.fn(),
}));

const { dispatch } = await import('./dispatch.mjs');
const { selectWork } = await import('../lanes/refine.mjs');
const { claim } = await import('./claim.mjs');
const step = (number, extra = {}) => ({
  number,
  title: `Product ${number}`,
  body: 'Kind: feature\nRequires: repository',
  author: { login: 'JamelHammoud' },
  createdAt: '2026-11-01T00:00:00Z',
  labels: [{ name: 'loop:next' }, { name: 'loop:feature' }, { name: 'loop:priority' }],
  ...extra,
});
const context = { log: vi.fn(), slot: '1' };
const run = (counts = {}) =>
  dispatch({
    lane: 'refine',
    module: { default: calls.fallback, schedule: { agent: true }, selectWork },
    context,
    capacity: () => ({ sessions: 0, loadPerCore: 0 }),
    counts: () => ({ openWaiting: 0, queuedRuns: 0, ...counts }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  calls.steps = [step(1)];
  calls.statuses = new Map();
  calls.historyAvailable = true;
  calls.execute.mockReturnValue({ ok: true, output: { changed: true, kind: 'feature', title: 'Product' } });
  calls.publish.mockImplementation(() => {
    calls.statuses.set(1, 'open');

    return 'pull/1';
  });
});
afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it('starts one founder product through the runner, shared claim and publication boundary', async () => {
  calls.execute.mockImplementationOnce((options) => {
    expect(claim('step-1')).toBeNull();
    expect(options).toMatchObject({ name: 'build', task: 'step-1', taskKind: 'feature', worker: 'refine-1' });

    return { ok: true, output: { changed: true, kind: 'feature', title: 'Product' } };
  });
  await run({ byLane: { refine: 3 } });
  expect(calls.execute).toHaveBeenCalledOnce();
  expect(calls.publish.mock.calls[0][0]).toMatchObject({ kind: 'feature', links: ['Closes #1.'] });
  expect(calls.fallback).not.toHaveBeenCalled();
});

it('excludes held and dependent and unavailable steps and takes the next ready product', async () => {
  calls.steps = [
    step(1),
    step(2, { body: 'Kind: feature\nDepends on #1.' }),
    step(3, { body: 'Requires: physical-robot' }),
    step(4),
  ];

  const release = claim('step-1');

  try {
    await run();
    expect(calls.execute.mock.calls[0][0].task).toBe('step-4');
  } finally {
    release();
  }
});

it('uses a useful refinement when no eligible product remains', async () => {
  calls.statuses.set(1, 'merged');
  await run();
  expect(calls.fallback).toHaveBeenCalledOnce();
  expect(calls.execute).not.toHaveBeenCalled();
});

it('applies product backpressure and frees the claim without inventing a refinement', async () => {
  await run({ openWaiting: 12 });
  expect(calls.execute).not.toHaveBeenCalled();
  expect(calls.fallback).not.toHaveBeenCalled();

  const release = claim('step-1');

  expect(release).toBeTypeOf('function');
  release();
});

it('prevents a simultaneous worker from executing the same product', async () => {
  calls.execute.mockImplementationOnce(() => {
    const other = selectWork({ slot: '2' });

    expect(other).toBeNull();

    return { ok: true, output: { changed: true, kind: 'feature', title: 'Product' } };
  });
  await run();
  await run();
  expect(calls.execute).toHaveBeenCalledOnce();
});

it('recovers a publication failure through the same build continuation', async () => {
  const session = { provider: 'codex', id: 'retained' };

  calls.steps = [step(5)];
  calls.execute.mockReturnValue({ ok: true, session, output: { changed: true, kind: 'feature', title: 'Product' } });
  calls.publish.mockImplementationOnce(() => {
    throw new Error('publication failed');
  });
  await expect(run()).rejects.toThrow('publication failed');
  await run();
  expect(calls.execute.mock.calls[1][0]).toMatchObject({ continuation: session, task: 'step-5' });
});

it('keeps founder priority and dependency-first ordering when borrowing a worker', async () => {
  calls.steps = [
    step(6, { labels: [{ name: 'loop:next' }], createdAt: '2020-01-01T00:00:00Z' }),
    step(7, { body: 'Kind: feature\nDepends on #8.' }),
    step(8, { body: 'Kind: integration', labels: [{ name: 'loop:next' }] }),
  ];
  await run();
  expect(calls.execute.mock.calls[0][0].task).toBe('step-8');
});

it('does not classify an explicit refinement as product work from a stale label', async () => {
  calls.steps = [step(9, { body: 'Kind: refine' })];
  await run();
  expect(calls.fallback).toHaveBeenCalledOnce();
});

it('keeps the refinement cap on fallback work', async () => {
  calls.steps = [];
  await run({ byLane: { refine: 3 } });
  expect(calls.fallback).not.toHaveBeenCalled();
});

it('refuses selected work at the existing producer capacity boundary and releases its claim', async () => {
  await dispatch({
    lane: 'refine',
    module: { default: calls.fallback, schedule: { agent: true }, selectWork },
    context,
    capacity: () => ({ sessions: 8, loadPerCore: 0 }),
    counts: () => {
      throw new Error('capacity must stop before flow lookup');
    },
  });
  expect(calls.execute).not.toHaveBeenCalled();

  const release = claim('step-1');

  expect(release).toBeTypeOf('function');
  release();
});

it('refuses a second publication if a pull appears during execution', async () => {
  calls.execute.mockImplementationOnce(() => {
    calls.statuses.set(1, 'open');

    return { ok: true, output: { changed: true, kind: 'feature', title: 'Product' } };
  });
  await run();
  expect(calls.publish).not.toHaveBeenCalled();
});

it('reserves distinct product steps for simultaneous workers before either starts an agent', async () => {
  calls.steps = [step(11), step(12)];

  const first = selectWork({ slot: '1' });
  const second = selectWork({ slot: '2' });

  calls.execute.mockImplementation((options) => ({
    ok: true,
    output: { changed: true, kind: options.taskKind, title: options.task },
  }));

  for (const selected of [first, second]) {
    await dispatch({
      lane: 'refine',
      module: { default: calls.fallback, schedule: { agent: true }, selectWork: () => selected },
      context,
      capacity: () => ({ sessions: 0, loadPerCore: 0 }),
      counts: () => ({ openWaiting: 0, queuedRuns: 0 }),
    });
  }

  expect(calls.execute.mock.calls.map(([options]) => options.task)).toEqual(['step-11', 'step-12']);
  expect(calls.publish.mock.calls.map(([change]) => change.links)).toEqual([['Closes #11.'], ['Closes #12.']]);
  expect(calls.fallback).not.toHaveBeenCalled();
});

it('keeps completed work recoverable when publication history cannot be verified', async () => {
  calls.execute.mockImplementationOnce(() => {
    calls.historyAvailable = false;

    return {
      ok: true,
      session: { provider: 'codex', id: 'history-thread' },
      output: { changed: true, kind: 'feature', title: 'Product' },
    };
  });
  await expect(run()).rejects.toThrow('Could not verify step publication history.');
  expect(calls.publish).not.toHaveBeenCalled();
});
