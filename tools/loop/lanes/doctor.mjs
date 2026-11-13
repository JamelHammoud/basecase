import fs from 'node:fs';
import path from 'node:path';
import { CHANGE_SCHEMA, runAgent } from '../lib/agent.mjs';
import { failingLanes, shouldCall } from '../lib/doctor.mjs';
import { breaches } from '../lib/flow.mjs';
import { fullCheck, isPaused, openPulls, pullReview, quickCheck } from '../lib/github.mjs';
import { LOGS } from '../lib/paths.mjs';
import { publish } from '../lib/pull.mjs';
import { json } from '../lib/sh.mjs';
import { store } from '../lib/store.mjs';
import { close, openBranch } from '../lib/worktree.mjs';
import { measure } from './health.mjs';

export const schedule = {
  agent: true,
  slots: 1,
  everySeconds: 600,
  does: "Calls an agent to find and fix why work isn't flowing when the loop stalls for 45 minutes or a lane keeps failing",
};

const visits = store('doctor', { stalledSince: null, lastCallAt: null });
const tail = (text, lines) => text.trim().split('\n').slice(-lines).join('\n');

function readLogs() {
  const files = fs.existsSync(LOGS) ? fs.readdirSync(LOGS).filter((f) => /^[a-z]+\.log$/.test(f)) : [];

  return Object.fromEntries(files.map((f) => [f.replace('.log', ''), fs.readFileSync(path.join(LOGS, f), 'utf8')]));
}

const pullLine = (pull) =>
  `- #${pull.number} ${pull.headRefName}: ${pull.mergeable}, quick ${quickCheck(pull)}, full ${fullCheck(pull)}, review ${pullReview(pull)}, opened ${pull.createdAt}: ${pull.title}`;

const mainRuns = () =>
  (
    json('gh', [
      'run',
      'list',
      '--workflow',
      'check.yml',
      '--branch',
      'main',
      '--limit',
      '6',
      '--json',
      'databaseId,headSha,status,conclusion,createdAt',
    ]) ?? []
  )
    .map((r) => `- ${r.databaseId} ${r.headSha.slice(0, 7)} ${r.createdAt} ${r.status} ${r.conclusion ?? ''}`)
    .join('\n');

function prompt({ found, failing, logs }) {
  const lanes = ['merge', 'review', 'rebase', 'revise', 'repair', 'health', ...failing];
  const logText = [...new Set(lanes)]
    .filter((lane) => logs[lane])
    .map((lane) => `### ${lane}.log\n${tail(logs[lane], failing.includes(lane) ? 60 : 15)}`)
    .join('\n\n');

  return [
    "The loop isn't flowing, and nobody else will look. Find why and fix it.",
    `Stalls: ${found.length > 0 ? found.join('; ') : 'none'}`,
    `Lanes whose last three runs failed: ${failing.length > 0 ? failing.join(', ') : 'none'}`,
    `Open pull requests:\n${openPulls({ fresh: true }).map(pullLine).join('\n') || '(none)'}`,
    `main's latest Check runs:\n${mainRuns()}`,
    `Lane logs (newest last):\n\n${logText}`,
  ].join('\n\n');
}

export default function doctor({ log }) {
  if (isPaused()) return log('paused (LOOP_PAUSED)');

  const state = visits.get('state');
  const now = Date.now();
  const found = breaches(measure(), now);
  const logs = readLogs();
  const failing = failingLanes(logs);

  state.stalledSince = found.length > 0 ? (state.stalledSince ?? now) : null;

  if (!shouldCall({ breaches: found, failing, stalledSince: state.stalledSince, lastCallAt: state.lastCallAt, now })) {
    visits.save('state', state);

    return log(found.length + failing.length > 0 ? 'watching' : 'flowing');
  }

  state.lastCallAt = now;
  visits.save('state', state);

  const worktree = openBranch('repair', 'doctor');

  try {
    const result = runAgent({
      cwd: worktree.dir,
      name: 'doctor',
      prompt: prompt({ found, failing, logs }),
      schema: CHANGE_SCHEMA,
      hours: 3,
    });

    if (!result.ok) return log(`doctor session failed: ${String(result.error).slice(0, 300)}`);

    const url = publish({ ...result.output, kind: 'repair' }, worktree);

    log(
      url ? `opened ${url}` : `no code change: ${String(result.output.notes ?? result.output.summary).slice(0, 300)}`,
    );
  } finally {
    close(worktree);
  }
}
