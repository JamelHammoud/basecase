import path from 'node:path';
import {
  closePull,
  createPull,
  hasLabel,
  isPaused,
  lastFinishedMainCheck,
  openPulls,
  pullCheck,
  pullReview,
  setReview,
} from '../lib/github.mjs';
import { HOME_CHECKOUT, WORKTREES } from '../lib/paths.mjs';
import { byRank, isRepair } from '../lib/rank.mjs';
import { json, run } from '../lib/sh.mjs';
import { store } from '../lib/store.mjs';
import { afterFailure, afterProbePassed, freshMembers, probeMembers } from '../lib/train.mjs';
import { close } from '../lib/worktree.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 60,
  does: 'Keeps a fresh batch of reviewed, quick-green pull requests on the full Check at all times, bisects a failed one beside it, and re-runs a failure once before believing it',
};

const BATCH = 'loop/batch/';
const train = store('batch', { suspects: [], probe: null, reruns: [] });

export const isBatch = (pull) => pull.headRefName.startsWith(BATCH);

export const eligible = (pull) =>
  !isBatch(pull) &&
  !isRepair(pull) &&
  pull.mergeable !== 'CONFLICTING' &&
  !hasLabel(pull, 'loop:revising') &&
  pullCheck(pull) === 'success' &&
  pullReview(pull) === 'success';

export const membersOf = (body) => [...(body ?? '').matchAll(/^- #(\d+) /gm)].map((match) => Number(match[1]));

const git = (args, cwd, opts = {}) => run('git', args, { cwd, ...opts });

const latestRun = (branch) =>
  json('gh', [
    'run',
    'list',
    '--workflow',
    'check.yml',
    '--branch',
    branch,
    '--limit',
    '1',
    '--json',
    'databaseId,attempt',
  ])?.[0] ?? null;

const rerunFailed = (runId) => run('gh', ['run', 'rerun', String(runId), '--failed'], { allowFail: true }).ok;

function mainIsRed(log) {
  const last = lastFinishedMainCheck();

  if (last?.conclusion !== 'failure') return false;

  const attempt = json('gh', ['run', 'view', String(last.databaseId), '--json', 'attempt'])?.attempt ?? 1;

  if (attempt < 2 && rerunFailed(last.databaseId))
    log('main is red; re-running its failed jobs once to rule out a flake');
  else log('main is red after a re-run; repairs go first');

  return true;
}

function sendBack(number, ready, log) {
  const pull = ready.find((candidate) => candidate.number === number);

  if (pull) setReview(pull.headRefOid, 'failure', 'Failed the full Check on its own in a batch, twice');

  log(`#${number} failed the full Check on its own; sent it back for revision`);
}

function rerunOnce(batch, state) {
  if (state.reruns.includes(batch.number)) return false;

  state.reruns.push(batch.number);

  const runInfo = latestRun(batch.headRefName);

  return Boolean(runInfo) && rerunFailed(runInfo.databaseId);
}

function failed(batch, state, ready, log) {
  if (rerunOnce(batch, state)) return log(`batch #${batch.number} failed; re-running once`);

  const members = membersOf(batch.body);
  const next = afterFailure(members);

  closePull(
    batch.number,
    'The full Check failed twice on this batch, so it closes and its pull requests are bisected.',
  );

  if (next.culprit) sendBack(next.culprit, ready, log);

  state.suspects = next.suspects;

  if (state.probe?.pr === batch.number) state.probe = null;

  log(`batch #${batch.number} failed twice; suspecting ${members.join(', ')}`);
}

function settleProbe(state, open, ready, log) {
  if (!state.probe || open.some((pull) => pull.number === state.probe.pr)) return;

  const next = afterProbePassed(state.suspects, state.probe.members);

  if (next.culprit) sendBack(next.culprit, ready, log);

  log(`bisecting batch #${state.probe.pr} passed; suspects now ${next.suspects.join(', ') || 'none'}`);
  state.suspects = next.suspects;
  state.probe = null;
}

function mergeMembers(members, byNumber, dir) {
  return members.filter((number) => {
    const ref = `origin/${byNumber.get(number).headRefName}`;
    const ok = git(['merge', '-q', '--no-ff', '--no-edit', ref], dir, { allowFail: true }).ok;

    if (!ok) git(['merge', '--abort'], dir, { allowFail: true });

    return ok;
  });
}

function build(members, ready, { log, probe }) {
  const stamp = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}${probe ? '-bisect' : ''}`;
  const branch = `${BATCH}${stamp}`;
  const dir = path.join(WORKTREES, `batch-${stamp}`);
  const byNumber = new Map(ready.map((pull) => [pull.number, pull]));

  git(['fetch', '-q', 'origin', 'main', ...members.map((n) => byNumber.get(n).headRefName)], HOME_CHECKOUT);
  git(['worktree', 'add', '-q', '-b', branch, dir, 'origin/main'], HOME_CHECKOUT);

  try {
    const merged = mergeMembers(members, byNumber, dir);

    if (merged.length === 0) return null;

    git(['push', '-q', '-u', 'origin', branch], dir);

    const lines = merged.map((number) => `- #${number} ${byNumber.get(number).title}`);
    const why = probe
      ? 'Bisects a failed batch: these pull requests are the first half of the suspects.'
      : 'Merges reviewed pull requests that passed their quick Check, so the full Check runs once for all of them.';
    const body = `${why} Merging this marks each one merged.\n\n${lines.join('\n')}\n`;
    const title = `Batch: ${merged.length} reviewed changes${probe ? ', bisecting' : ''}`;
    const url = createPull({ branch, title, body, label: 'loop:batch' });
    const head = git(['rev-parse', 'HEAD'], dir).out;

    setReview(head, 'success', `Every one of its ${merged.length} pull requests passed review`);
    log(`opened ${url} with ${merged.join(', ')}`);

    return { pr: Number(String(url).split('/').pop()), members: merged };
  } finally {
    close({ dir, branch });
  }
}

function fill(state, open, ready, log) {
  const numbers = ready.map((pull) => pull.number);
  const batches = open.filter(isBatch);
  const probeOpen = Boolean(state.probe) && batches.some((b) => b.number === state.probe.pr);
  const freshOpen = batches.some((b) => b.number !== state.probe?.pr);
  const probe = probeMembers(state.suspects, numbers);

  if (state.suspects.length > 0 && !probeOpen && probe.length > 0) {
    state.probe = build(probe, ready, { log, probe: true });
  }

  const fresh = freshMembers(numbers, state.suspects);

  if (freshOpen) return;

  if (fresh.length > 0) build(fresh, ready, { log, probe: false });
  else log('nothing reviewed and green to batch');
}

export default function batch({ log }) {
  if (isPaused()) return log('paused (LOOP_PAUSED)');

  if (mainIsRed(log)) return;

  const state = train.get('state');
  const open = openPulls({ fresh: true });
  const ready = open.filter(eligible).sort(byRank);

  settleProbe(state, open, ready, log);

  for (const pull of open.filter((p) => isBatch(p) && pullCheck(p) === 'failure')) failed(pull, state, ready, log);

  fill(state, openPulls({ fresh: true }), ready, log);
  state.reruns = state.reruns.slice(-50);
  train.save('state', state);
}
