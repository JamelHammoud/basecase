import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  execute: vi.fn(),
  publish: vi.fn(),
  steps: [],
  signature: 'source-a',
  pulls: new Map(),
  historyAvailable: true,
}));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-outcomes-'));

vi.stubEnv('BASECASE_LOOP_DIR', root);
vi.mock('./agent.mjs', () => ({ CHANGE_SCHEMA: {} }));
vi.mock('./github.mjs', () => ({
  issues: (label) => state.steps.filter((step) => step.labels.some((item) => item.name === label)),
  hasLabel: (step, label) => step.labels.some((item) => item.name === label),
  closeIssue: vi.fn(),
  commentOnIssue: vi.fn(),
  editIssueLabels: (number, { add = [], remove = [] }) => {
    const step = state.steps.find((item) => item.number === number);

    step.labels = [...step.labels.filter((item) => !remove.includes(item.name)), ...add.map((name) => ({ name }))];
  },
}));
vi.mock('./stepPulls.mjs', async (original) => ({
  ...(await original()),
  pullHistory: () =>
    state.historyAvailable
      ? [...state.pulls].map(([number, status]) => ({ number, state: status.toUpperCase(), isDraft: true }))
      : null,
  stepPullIndex: () => state.pulls,
  stepStatus: (index, n) => index.get(n) ?? 'none',
}));
vi.mock('./taskInputs.mjs', () => ({ taskInputSignature: () => state.signature }));
vi.mock('./preflight.mjs', () => ({ checkedRun: state.execute }));
vi.mock('./pull.mjs', () => ({ publish: state.publish }));
vi.mock('./workRecovery.mjs', async (original) => ({
  ...(await original()),
  refreshRecovery: () => 'Refreshed main.',
}));
vi.mock('./worktree.mjs', async () => {
  const { hasRecovery } = await import('./workRecovery.mjs');

  return {
    openBranch: () => {
      const dir = fs.mkdtempSync(path.join(root, 'work-'));

      return { dir, branch: `loop/build/${path.basename(dir)}` };
    },
    close: ({ dir }) => {
      if (!hasRecovery(dir)) fs.rmSync(dir, { recursive: true, force: true });
    },
  };
});

const { claimNextStep, executeClaim } = await import('../lanes/build.mjs');
const { recoveryFor, saveRecovery } = await import('./workRecovery.mjs');
const { recordDecline, stepEntry } = await import('./stepState.mjs');
let number = 2000;
const session = { provider: 'codex', id: 'same-session', totalUsage: { input_tokens: 50 } };
const outcome = (status, extra = {}) => ({
  status,
  reason: 'Original acceptance remains.',
  evidence: ['scratch/task-handoff.json'],
  dependencies: [],
  capabilities: [],
  ...extra,
});
const answer = (status, extra) => ({
  ok: true,
  session,
  output: {
    changed: status === 'complete',
    kind: 'feature',
    checked: status === 'complete' ? 'Original acceptance checks passed' : 'Checks remain',
    outcome: outcome(status, extra),
  },
});
const run = () => {
  const next = claimNextStep();

  if (next) executeClaim(next, { log: vi.fn(), slot: 1 });

  return next;
};

beforeEach(() => {
  vi.clearAllMocks();
  number++;
  state.signature = 'source-a';
  state.pulls = new Map();
  state.historyAvailable = true;
  state.steps = [
    {
      number,
      title: 'Finish the feature',
      body: 'Kind: feature\nRequires: repository\nInputs: `src/cameras/`\nAccept the whole feature.',
      author: { login: 'JamelHammoud' },
      labels: [{ name: 'loop:next' }],
      createdAt: '2026-11-16T00:00:00Z',
    },
  ];
  state.publish.mockImplementation(() => {
    state.pulls.set(number, 'open');

    return 'pull/feature';
  });
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it.each([true, false])(
  'retains edits=%s and handoff, resumes the same session and publishes original acceptance once',
  (edits) => {
    let retained;

    state.execute
      .mockImplementationOnce(({ cwd }) => {
        retained = cwd;
        fs.mkdirSync(path.join(cwd, 'scratch'));
        fs.writeFileSync(path.join(cwd, 'scratch/task-handoff.json'), 'remaining acceptance');

        if (edits) {
          execFileSync('git', ['init', '-q', cwd]);
          fs.writeFileSync(path.join(cwd, 'feature.mjs'), 'original');
          execFileSync('git', ['add', 'feature.mjs'], { cwd });
          fs.writeFileSync(path.join(cwd, 'feature.mjs'), 'unfinished');
        }

        expect(claimNextStep()).toBeNull();

        return answer('incomplete');
      })
      .mockImplementationOnce((options) => {
        expect(options).toMatchObject({ cwd: retained, continuation: session, task: `step-${number}` });
        expect(options.prompt).toContain('Accept the whole feature.');
        expect(fs.readFileSync(path.join(retained, 'scratch/task-handoff.json'), 'utf8')).toBe('remaining acceptance');
        expect(options.deadlineAt).toBe(state.execute.mock.calls[0][0].deadlineAt);

        if (edits) expect(fs.readFileSync(path.join(retained, 'feature.mjs'), 'utf8')).toBe('unfinished');

        return answer('complete', { evidence: ['Original acceptance checks passed'] });
      });
    run();
    expect(state.publish).not.toHaveBeenCalled();
    expect(stepEntry(number).declines).toBe(0);
    expect(recoveryFor(number)).toMatchObject({ dir: retained, attempts: 0, outcome: { status: 'incomplete' } });
    run();
    run();
    expect(state.execute).toHaveBeenCalledTimes(2);
    expect(state.publish).toHaveBeenCalledOnce();
    expect(state.publish.mock.calls[0][0]).toMatchObject({
      checked: 'Original acceptance checks passed',
      links: [`Closes #${number}.`],
    });
    expect(recoveryFor(number)).toBeNull();
  },
);

it.each(['incomplete', 'invalid', 'interrupted'])('bounds %s recovery and retains an unresolved reason', (status) => {
  const result =
    status === 'invalid'
      ? { ...answer('complete'), output: { changed: true, outcome: { status: 'unknown' } } }
      : answer('incomplete');

  state.execute.mockReturnValue(
    status === 'interrupted' ? { ok: false, session, error: 'provider interrupted' } : result,
  );
  run();
  run();
  expect(run()).toBeNull();
  expect(state.execute).toHaveBeenCalledTimes(2);
  expect(state.publish).not.toHaveBeenCalled();
  expect(recoveryFor(number)).toMatchObject({ attempts: 1, reason: expect.any(String) });
});

it.each([{ dependencies: [99] }, { capabilities: ['physical-robot'] }])(
  'keeps demonstrated block %j and retained edits without resuming unchanged work',
  (block) => {
    state.pulls.set(99, 'open');
    state.execute.mockReturnValue(answer('blocked', block));
    run();
    expect(run()).toBeNull();
    expect(state.publish).not.toHaveBeenCalled();
    expect(recoveryFor(number).outcome.status).toBe('blocked');
    state.signature = 'source-b';

    expect(run()).toBeNull();
    expect(state.execute).toHaveBeenCalledOnce();

    state.pulls.delete(99);

    if (block.dependencies) expect(run()).not.toBeNull();
  },
);

it('waits on the same prerequisite after its only unchanged-input continuation discovers the block', () => {
  state.pulls.set(99, 'open');
  state.execute
    .mockReturnValueOnce(answer('incomplete'))
    .mockReturnValueOnce(answer('blocked', { dependencies: [99] }))
    .mockReturnValueOnce(answer('complete'));
  run();
  run();
  expect(recoveryFor(number)).toMatchObject({ attempts: 1, outcome: { status: 'blocked' } });
  expect(run()).toBeNull();
  expect(state.steps[0].labels).toEqual([{ name: 'loop:blocked' }]);
  state.historyAvailable = false;
  expect(run()).toBeNull();
  state.historyAvailable = true;
  state.pulls.delete(99);
  expect(run()).not.toBeNull();
  expect(state.execute.mock.calls[2][0].continuation).toEqual(session);
  expect(state.publish).toHaveBeenCalledOnce();
});

it('keeps unpublished hosted diagnostics blocked even with published Windows diagnostics available', () => {
  vi.stubEnv('BASECASE_LOOP_CAPABILITIES', 'windows-diagnostics');
  state.execute.mockReturnValueOnce(answer('blocked', { capabilities: ['windows-unpublished-diagnostics'] }));

  try {
    run();
    state.signature = 'source-b';
    expect(run()).toBeNull();
    expect(state.execute).toHaveBeenCalledOnce();
    vi.stubEnv('BASECASE_LOOP_CAPABILITIES', 'windows-diagnostics,windows-unpublished-diagnostics');
    state.execute.mockReturnValueOnce(answer('complete'));
    expect(run()).not.toBeNull();
    expect(state.publish).toHaveBeenCalledOnce();
  } finally {
    vi.stubEnv('BASECASE_LOOP_CAPABILITIES', '');
  }
});

it('honors a retained block even if the worker stopped before recording the step wait', () => {
  const dir = fs.mkdtempSync(path.join(root, 'retained-block-'));
  const step = state.steps[0];

  state.pulls.set(99, 'open');
  saveRecovery(number, {
    worktree: { dir, originalTask: `${step.title}\n\n${step.body}` },
    session,
    inputSignature: state.signature,
    outcome: outcome('blocked', { dependencies: [99] }),
  });
  state.signature = 'source-b';
  expect(run()).toBeNull();
  expect(state.execute).not.toHaveBeenCalled();
  state.pulls.delete(99);
  state.execute.mockReturnValueOnce(answer('complete'));
  expect(run()).not.toBeNull();
  expect(state.publish).toHaveBeenCalledOnce();
});

it('does not convert prose or an unverified dependency into authority', () => {
  state.steps[0].body += '\nComment claims Requires: physical-robot.';
  state.execute.mockReturnValue(answer('blocked', { dependencies: [99999] }));
  run();
  expect(recoveryFor(number).outcome.status).toBe('incomplete');
  expect(stepEntry(number).missing).toBeUndefined();
  expect(run()).not.toBeNull();
});

it('keeps deliberate declines distinct from unfinished execution', () => {
  state.execute.mockReturnValue(answer('declined'));
  run();
  expect(run()).toBeNull();
  expect(stepEntry(number).declines).toBe(1);
});

it('refreshes changed inputs without replacing the original scope or deadline', () => {
  state.execute.mockReturnValue(answer('incomplete'));
  run();
  run();

  const retained = recoveryFor(number);

  state.signature = 'source-b';
  run();
  expect(state.execute.mock.calls[2][0]).toMatchObject({
    cwd: retained.dir,
    continuation: session,
    deadlineAt: retained.deadlineAt,
  });
  expect(state.execute.mock.calls[2][0].prompt).toContain('Refreshed main.');
});

it('reconsiders an older incorrect decline only with retained incomplete execution and remaining recovery', () => {
  state.execute.mockReturnValue(answer('incomplete'));
  run();
  recordDecline(number, { now: Date.now(), waitFor: [], missing: [], inputSignature: state.signature });
  expect(run()).not.toBeNull();
  expect(run()).toBeNull();
});

it('preserves real legacy blocks and elapsed deadlines', () => {
  const dir = fs.mkdtempSync(path.join(root, 'expired-'));

  saveRecovery(number, {
    worktree: { dir, deadlineAt: Date.now() - 1 },
    session,
    inputSignature: state.signature,
    outcome: outcome('incomplete'),
  });
  expect(run()).toBeNull();
  expect(state.execute).not.toHaveBeenCalled();
});

it.each([
  undefined,
  outcome('unknown'),
  outcome('complete'),
  outcome('blocked', { capabilities: ['repository'] }),
  outcome('incomplete', { evidence: [] }),
  outcome('declined', { dependencies: [99] }),
])('retains invalid outcome %j without publishing or inventing a block', (invalid) => {
  state.execute.mockReturnValue({ ok: true, session, output: { changed: false, outcome: invalid } });
  run();
  expect(state.publish).not.toHaveBeenCalled();
  expect(recoveryFor(number)).toMatchObject({
    outcome: { status: 'incomplete', reason: expect.stringContaining('Invalid build outcome') },
  });
  expect(stepEntry(number).declines).toBe(0);
});

it('retains sessionless unfinished work and refuses repeated fresh starts after its existing continuation', () => {
  state.execute.mockReturnValue({ ...answer('incomplete'), session: null });
  run();
  run();
  expect(run()).toBeNull();
  expect(state.execute).toHaveBeenCalledTimes(2);
  expect(state.execute.mock.calls[1][0].cwd).toBe(state.execute.mock.calls[0][0].cwd);
});

it('preserves genuine legacy capability and dependency blocks despite retained unfinished execution', () => {
  state.execute.mockReturnValue(answer('incomplete'));
  run();
  recordDecline(number, {
    now: Date.now(),
    waitFor: [99],
    missing: ['physical-robot'],
    inputSignature: state.signature,
  });
  state.pulls.set(99, 'open');
  expect(run()).toBeNull();
  expect(state.execute).toHaveBeenCalledOnce();
});

it('replays six frozen incomplete invocations through three retained sessions with synthetic acceptance completions', async () => {
  const { taskUsage } = await import('./usageTasks.mjs');
  const sample = JSON.parse(fs.readFileSync(new URL('../fixtures/incomplete-attempts.json', import.meta.url), 'utf8'));
  const records = [];
  const pulls = [];

  for (const [task, attempts] of Object.entries(Object.groupBy(sample, (record) => record.task))) {
    state.steps[0].number = Number(task.slice(5));
    state.steps[0].labels = [{ name: 'loop:next' }];
    number = state.steps[0].number;
    state.execute
      .mockImplementationOnce(() => {
        records.push({ ...attempts[0], result: { ...attempts[0].result, outcome: outcome('incomplete') } });

        return answer('incomplete');
      })
      .mockImplementationOnce((options) => {
        expect(options.continuation).toEqual(session);
        records.push({
          ...attempts[1],
          continuedFrom: session.id,
          result: { changed: true, outcome: outcome('complete') },
        });

        return answer('complete', { evidence: ['Synthetic original acceptance passed'] });
      });
    run();
    expect(recoveryFor(number)).not.toBeNull();
    run();
    pulls.push({ number, state: 'MERGED', headRefName: `loop/build/${number}-sample`, body: `Closes #${number}.` });
  }

  const before = taskUsage(sample, []);
  const after = taskUsage(records, pulls);

  expect(new Set(sample.map((record) => record.workId)).size).toBe(6);
  expect(before.mergedTasks).toBe(0);
  expect(before.totalWork.unknownBuildOutcomes).toBe(6);
  expect(after.mergedTasks).toBe(3);
  expect(after.byKind.feature.incompleteAttemptsPerMergedTask).toBe(1);
  expect(after.totalWork).toMatchObject({ sessions: 6, tokens: 2660727, milliseconds: 528156 });
  expect(after.totalWorkPerMergedTask).toEqual({ tokens: 886909, milliseconds: 176052 });
  expect(state.publish).toHaveBeenCalledTimes(3);
  expect(state.execute.mock.calls.filter(([options]) => !options.continuation)).toHaveLength(3);
  expect(records).toHaveLength(sample.length);
});
