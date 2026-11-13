import { createIssue, isPaused } from '../lib/github.mjs';
import { failedTests, flakeStep, passedOnRerun, slowStep, slowTests } from '../lib/flakes.mjs';
import { json, run } from '../lib/sh.mjs';
import { store } from '../lib/store.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 600,
  does: 'Files a fix step for each test that passed only on a re-run, and for each test over 30 s on main',
};

const STEP_LABELS = ['loop:next', 'loop:building'];
const seen = store('flakes', { runs: [], slowScanned: null });

const recentRuns = () =>
  json('gh', [
    'run',
    'list',
    '--workflow',
    'check.yml',
    '--status',
    'success',
    '--limit',
    '100',
    '--json',
    'databaseId,headBranch,conclusion,attempt,url',
  ]) ?? [];

const firstAttemptLog = (runId) =>
  run('gh', ['run', 'view', String(runId), '--attempt', '1', '--log-failed'], { allowFail: true }).out;

const latestGreenMain = () =>
  json('gh', [
    'run',
    'list',
    '--workflow',
    'check.yml',
    '--branch',
    'main',
    '--status',
    'success',
    '--limit',
    '1',
    '--json',
    'databaseId,url',
  ])?.[0] ?? null;

function fileSlowTests(state, log) {
  const green = latestGreenMain();

  if (!green || state.slowScanned === green.databaseId) return;

  const fullLog = run('gh', ['run', 'view', String(green.databaseId), '--log'], { allowFail: true }).out;

  for (const test of slowTests(fullLog)) {
    const url = createIssue({
      ...slowStep(test, green.url),
      labels: ['loop:next', 'loop:fix'],
      similarAmong: STEP_LABELS,
    });

    log(url ? `slow: ${test.name} (${test.ms} ms); filed ${url}` : `slow: ${test.name}; a step is already open`);
  }

  state.slowScanned = green.databaseId;
}

export default function flakes({ log }) {
  if (isPaused()) return log('paused (LOOP_PAUSED)');

  const state = seen.get('state');
  const fresh = recentRuns().filter((r) => passedOnRerun(r) && !state.runs.includes(r.databaseId));

  for (const runInfo of fresh) {
    for (const test of failedTests(firstAttemptLog(runInfo.databaseId))) {
      const step = flakeStep(test, runInfo.url);
      const url = createIssue({
        ...step,
        labels: ['loop:next', 'loop:fix', 'loop:priority'],
        similarAmong: STEP_LABELS,
      });

      log(url ? `flaky: ${test}; filed ${url}` : `flaky: ${test}; a step is already open`);
    }

    state.runs.push(runInfo.databaseId);
  }

  if (fresh.length === 0) log('no run passed only on a re-run');

  fileSlowTests(state, log);

  state.runs = state.runs.slice(-300);
  seen.save('state', state);
}
