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
import { isRepair } from '../lib/rank.mjs';
import { run } from '../lib/sh.mjs';
import { store } from '../lib/store.mjs';
import { close } from '../lib/worktree.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 300,
  does: 'Combines reviewed pull requests that passed their quick Check into one batch that runs the full Check once, and splits a batch that fails',
};

const MAX = 15;
const BATCH = 'loop/batch/';
const suspects = store('batch', { suspects: [] });

export const isBatch = (pull) => pull.headRefName.startsWith(BATCH);

export const eligible = (pull) =>
  !isBatch(pull) &&
  !isRepair(pull) &&
  pull.mergeable !== 'CONFLICTING' &&
  !hasLabel(pull, 'loop:revising') &&
  pullCheck(pull) === 'success' &&
  pullReview(pull) === 'success';

export const membersOf = (body) => [...(body ?? '').matchAll(/^- #(\d+) /gm)].map((match) => Number(match[1]));

export const nextMembers = (ready, failed) => {
  const stillReady = failed.filter((number) => ready.some((pull) => pull.number === number));

  if (stillReady.length > 0) return stillReady.slice(0, Math.max(1, Math.ceil(stillReady.length / 2)));

  return ready.slice(0, MAX).map((pull) => pull.number);
};

const git = (args, cwd, opts = {}) => run('git', args, { cwd, ...opts });

function sendBack(batch, number, ready, log) {
  const pull = ready.find((candidate) => candidate.number === number);

  if (pull) setReview(pull.headRefOid, 'failure', `Failed the full Check on its own in batch #${batch.number}`);

  suspects.save('state', { suspects: [] });
  log(`batch #${batch.number} failed with only #${number}; sent it back for revision`);
}

function settleFailed(batch, ready, log) {
  const members = membersOf(batch.body);

  closePull(
    batch.number,
    'The full Check failed on this batch, so it closes and the batch lane retries with half of it.',
  );

  if (members.length === 1) return sendBack(batch, members[0], ready, log);

  suspects.save('state', { suspects: members });
  log(`batch #${batch.number} failed; next batch tries half of its ${members.length} pull requests`);
}

function build(members, ready, log) {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
  const branch = `${BATCH}${stamp}`;
  const dir = path.join(WORKTREES, `batch-${stamp}`);
  const byNumber = new Map(ready.map((pull) => [pull.number, pull]));

  git(['fetch', '-q', 'origin', 'main', ...members.map((n) => byNumber.get(n).headRefName)], HOME_CHECKOUT);
  git(['worktree', 'add', '-q', '-b', branch, dir, 'origin/main'], HOME_CHECKOUT);

  try {
    const merged = members.filter((number) => {
      const ok = git(['merge', '-q', '--no-ff', '--no-edit', `origin/${byNumber.get(number).headRefName}`], dir, {
        allowFail: true,
      }).ok;

      if (!ok) git(['merge', '--abort'], dir, { allowFail: true });

      return ok;
    });

    if (merged.length === 0) {
      log('no ready pull request merged cleanly onto main');

      return;
    }

    git(['push', '-q', '-u', 'origin', branch], dir);

    const lines = merged.map((number) => `- #${number} ${byNumber.get(number).title}`);
    const body = `Merges ${merged.length} reviewed pull requests that passed their quick Check, so the full Check runs once for all of them. Each keeps its own review and changelog entry, and merging this marks each one merged.\n\n${lines.join('\n')}\n`;
    const url = createPull({ branch, title: `Batch: ${merged.length} reviewed changes`, body, label: 'loop:batch' });
    const head = git(['rev-parse', 'HEAD'], dir).out;

    setReview(head, 'success', `Every one of its ${merged.length} pull requests passed review`);
    log(`opened ${url} with ${merged.join(', ')}`);
  } finally {
    close({ dir, branch });
  }
}

export default function batch({ log }) {
  if (isPaused()) return log('paused (LOOP_PAUSED)');

  if (lastFinishedMainCheck()?.conclusion === 'failure') return log('main is red; repairs go first');

  const open = openPulls({ fresh: true });
  const current = open.find(isBatch);
  const ready = open.filter(eligible).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (current && pullCheck(current) === 'failure') return settleFailed(current, ready, log);

  if (current) return log(`batch #${current.number} is still running`);

  if (ready.length === 0) return log('nothing reviewed and green to batch');

  build(nextMembers(ready, suspects.get('state').suspects), ready, log);
}
