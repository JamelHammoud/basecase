import { createIssue, isPaused } from '../lib/github.mjs';
import { failedTests, flakeStep, passedOnRerun } from '../lib/flakes.mjs';
import { json, run } from '../lib/sh.mjs';
import { store } from '../lib/store.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 600,
  does: 'Files a priority fix step for each test that failed on main or a batch and passed when run again',
};

const STEP_LABELS = ['loop:next', 'loop:building'];
const seen = store('flakes', { runs: [] });

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

  state.runs = state.runs.slice(-300);
  seen.save('state', state);
}
