import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-provenance-'));

vi.stubEnv('BASECASE_LOOP_DIR', root);

const runner = vi.hoisted(() => vi.fn(() => ({ ok: true, output: { changed: true, kind: 'refine' } })));

vi.mock('./codex.mjs', () => ({ runCodex: runner }));

const { recordSession, updateSession } = await import('./sessionJournal.mjs');
const { workIdentity } = await import('./publicationJournal.mjs');
const { runAgent } = await import('./agent.mjs');
const { voiceText } = await import('../../voice/voice.mjs');
const { saveDelivery, hasPendingDelivery } = await import('./deliveryState.mjs');
const { deliver } = await import('./deliver.mjs');
const { usageReport } = await import('./usageReport.mjs');
const cacheDir = path.join(root, 'state', 'cache');
const pulls = [];
const at = Date.now();
const buildOptions = {
  cwd: root,
  name: 'build',
  worker: 'build-1',
  task: 'step-10',
  system: 'Fixture',
  prompt: 'Fixture',
  schema: {},
};

function writeHistory(value) {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, 'all-step-pulls.json'), JSON.stringify({ at: Date.now(), value }));
}

function report(args = []) {
  return JSON.parse(
    execFileSync(process.execPath, ['tools/loop/usage.mjs', 'json', ...args], {
      env: { ...process.env, BASECASE_LOOP_DIR: root },
      encoding: 'utf8',
    }),
  );
}

function invocation(task, extra = {}) {
  return recordSession({
    task,
    startedAt: at,
    state: 'completed',
    ok: true,
    provider: 'codex',
    model: 'fixture',
    usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 8 },
    durationMs: 100,
    ...extra,
  });
}

function publish(number, body, options = {}) {
  const dir = path.join(root, `repo-${number}`);

  fs.mkdirSync(dir, { recursive: true });

  const branch = `loop/refine/${number}`;
  const entry = saveDelivery({ dir, branch, body, sha: 'verified', label: `loop:${options.taskKind ?? 'refine'}` });
  const services = {
    execute: () => ({ out: 'verified' }),
    readJson: () => [],
    create: () => `https://example.com/pull/${number}`,
  };

  invocation(branch.replaceAll('/', '-'), { workId: workIdentity(dir), ...options });

  return { entry, services, dir };
}

function revisePublication(entry, services) {
  const dir = path.join(root, 'revision-8');

  fs.mkdirSync(dir, { recursive: true });

  const revision = saveDelivery({ ...entry, dir, number: 8, sha: 'revised' });

  deliver(revision, {
    ...services,
    execute: () => ({ out: 'revised' }),
    readJson: () => ({ url: 'https://example.com/pull/8', state: 'OPEN' }),
    edit: () => {},
  });
}

function recordEarlierAndVoice(dir) {
  invocation('earlier-work', { workId: workIdentity(dir), startedAt: at - 2 * 86_400_000 });
  runner.mockReturnValueOnce({
    ok: true,
    output: { text: 'Fixture' },
    usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 8 },
  });

  expect(voiceText('Fixture', { kind: 'pull', origin: { cwd: dir } })).toBe('Fixture');
}

beforeAll(() => {
  fs.mkdirSync(path.join(root, 'state', 'quota'), { recursive: true });
  fs.writeFileSync(path.join(root, 'state', 'quota', 'codex.json'), JSON.stringify({ at, windows: [] }));
  writeHistory([]);
});

it('uses the selected CLI end date for its default start and rejects reversed date windows', () => {
  const until = at - 2 * 86_400_000;
  const historical = report(['--until', new Date(until).toISOString()]);

  expect(historical.completionWindow).toMatchObject({ since: until - 86_400_000, until });
  expect(historical.sessions).toBe(0);
  expect(() => report(['--since', new Date(at + 86_400_000).toISOString()])).toThrow(
    'Use ISO dates with --since before --until',
  );
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it('runs real journal, delivery recovery and JSON CLI over retained invocation histories', () => {
  const cases = [
    [1, 'Closes #10.', 'MERGED'],
    [2, 'Closes #11.', 'MERGED'],
    [3, '', 'CLOSED'],
    [4, 'Rebuilds #3.', 'MERGED'],
    [5, 'Closes #12. Closes #13.', 'MERGED'],
    [6, '', 'CLOSED'],
    [7, '', 'OPEN'],
    [8, '', 'MERGED'],
    [9, 'Closes #14.', 'CLOSED'],
    [10, '', 'CLOSED'],
    [11, '- #9 Feature: Member\n- #10 Refine: Member', 'MERGED', 'Batch: Land members'],
  ];

  for (const [number, body, state, title] of cases) {
    const { entry, services, dir } = publish(
      number,
      body,
      { 1: { worker: 'build-1', taskKind: 'feature' }, 2: { worker: 'refine-2', taskKind: 'feature' } }[number] ?? {},
    );

    if (number === 7) {
      expect(() =>
        deliver(entry, {
          ...services,
          create: () => {
            throw new Error('response lost');
          },
        }),
      ).toThrow('response lost');
      expect(hasPendingDelivery(entry.branch)).toBe(true);
      writeHistory(pulls);

      const beforeRecovery = usageReport();

      expect(beforeRecovery.taskWork).toMatchObject({ mergedTasks: 3, unfinished: { sessions: 1 } });
      expect(beforeRecovery.publications.find((item) => item.branch === entry.branch)).toMatchObject({ number: null });
    }

    deliver(entry, services);
    expect(hasPendingDelivery(entry.branch)).toBe(false);
    pulls.push({
      number,
      state,
      title,
      body,
      headRefName: entry.branch,
      mergedAt: state === 'MERGED' ? new Date(at).toISOString() : null,
    });

    if (number === 8) {
      revisePublication(entry, services);
      recordEarlierAndVoice(dir);
    }

    if (number === 4) invocation('rebuild-original', { taskId: 'pull:3', workId: workIdentity(dir) });
  }

  runner.mockReturnValueOnce({ ok: false, error: 'interrupted', session: { id: 'continued-thread' } });

  const failed = runAgent(buildOptions);

  runAgent({ ...buildOptions, continuation: failed.session });
  invocation('revise-1', { name: 'revise' });
  invocation('revise-1', { name: 'revise' });
  updateSession(invocation('review-1-a', { name: 'review' }), { reviewOutcome: 'fail' });
  updateSession(invocation('review-1-b', { name: 'review' }), { reviewOutcome: 'pass' });
  invocation('step-99', { state: 'running', usage: null, durationMs: undefined });
  invocation('planning', { shared: true });
  invocation('unknown');
  runAgent({ cwd: root, name: 'refine', system: 'Fixture', prompt: 'Fixture', schema: {} });
  writeHistory(pulls);

  const full = report(['--since', new Date(at - 1).toISOString(), '--until', new Date(at + 86_400_000).toISOString()]);
  const result = full.taskWork;

  expect(full.publications.find((entry) => entry.number === 8)).toMatchObject({
    commits: ['verified', 'revised'],
    publishedSha: 'revised',
  });

  expect(result).toMatchObject({
    mergedTasks: 6,
    abandoned: { sessions: 1 },
    unfinished: { sessions: 2 },
    running: { sessions: 1, tokens: null },
    shared: { sessions: 3 },
    unattributed: { sessions: 1 },
    reconciliation: { inputSessions: 23, accountedSessions: 23, ambiguous: 0 },
  });
  expect(result.tasks.find((task) => task.task === 'step:10')).toMatchObject({
    kind: 'feature',
    workers: ['build-1'],
    sessions: 7,
    missingUsage: 2,
    tokens: null,
    reviewAttempts: 2,
    revisions: 2,
    reviewOutcomes: { fail: 1, pass: 1 },
  });
  expect(result.tasks.find((task) => task.task === 'step:11')).toMatchObject({
    workers: ['refine-2'],
    kind: 'feature',
  });
  expect(result.byKind.feature).toMatchObject({ reviewAttempts: 2, reviewOutcomes: { fail: 1, pass: 1 } });
  expect(result.provenance.some((entry) => entry.continuedFrom === 'continued-thread')).toBe(true);
  expect(result.sharedTasks.find((task) => task.task === 'batch:11')).toMatchObject({
    sessions: 1,
    pulls: [9, 10, 11],
  });
  expect(result.sharedTasks[0]).toMatchObject({ steps: [12, 13], sessions: 1 });

  expect(full.completionWindow.tasks.find((task) => task.task === 'pull:8')).toMatchObject({
    sessions: 3,
    tokens: 45,
  });
  expect(full.taskWork.tasks.find((task) => task.task === 'pull:8')).toMatchObject({ sessions: 2, tokens: 30 });
  expect(full.retention.sessions).toBe(24);
  expect(full.completionWindow.byKind.feature.reviewOutcomes).toEqual({ fail: 1, pass: 1 });

  writeHistory(null);
  expect(usageReport().taskWork).toMatchObject({ linkageAvailable: false, mergedTasks: 0 });
});
