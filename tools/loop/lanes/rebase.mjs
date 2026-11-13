import path from 'node:path';
import { runAgent } from '../lib/agent.mjs';
import { claim } from '../lib/claim.mjs';
import { lastFinishedMainCheck, openPulls, pullCheck, pullComments } from '../lib/github.mjs';
import { HOME_CHECKOUT, WORKTREES } from '../lib/paths.mjs';
import { entryFor, recordConflictFail } from '../lib/pullState.mjs';
import { byRank } from '../lib/rank.mjs';
import { rebuild } from '../lib/rebuild.mjs';
import { run } from '../lib/sh.mjs';
import { clearPath, close, linkModules } from '../lib/worktree.mjs';

export const schedule = {
  slots: 3,
  everySeconds: 60,
  does: 'Merges main into conflicting loop/ branches, an agent resolving the conflicts, rebuilds a change whose conflicts fail twice, and refreshes a pull request whose Check failed on an older main',
};

const MAX_CONFLICT_FAILS = 2;

const SCHEMA = {
  type: 'object',
  properties: { resolved: { type: 'boolean' }, notes: { type: 'string' } },
  required: ['resolved', 'notes'],
};

const git = (args, cwd, opts = {}) => run('git', args, { cwd, ...opts });

const conflictedFiles = (dir) =>
  git(['diff', '--name-only', '--diff-filter=U'], dir, { allowFail: true }).out.split('\n').filter(Boolean);

function mainSide(dir, files) {
  const base = git(['merge-base', 'HEAD', 'MERGE_HEAD'], dir, { allowFail: true }).out.trim();

  return git(['log', '--format=%h %s', `${base}..MERGE_HEAD`, '--', ...files], dir, { allowFail: true }).out.slice(
    0,
    20_000,
  );
}

function resolveConflicts(pull, dir) {
  const files = conflictedFiles(dir);
  const prompt = `Merging main into pull request #${pull.number} (${pull.title}) left conflicts in:\n${files.join('\n')}\n\nThe pull request:\n\n${pull.body}\n\nWhat main changed in those files since the branch split:\n${mainSide(dir, files)}`;
  const result = runAgent({ cwd: dir, name: 'rebase', prompt, schema: SCHEMA, hours: 2 });
  const clean = git(['diff', '--check'], dir, { allowFail: true }).ok && conflictedFiles(dir).length === 0;

  if (!result.ok || !result.output.resolved || !clean) return false;

  git(['add', '-A'], dir);
  git(['commit', '-q', '--no-edit'], dir);

  return true;
}

function giveUp(pull, log) {
  const fails = recordConflictFail(pull.number);

  log(`#${pull.number}: conflicts left unresolved (${fails} of ${MAX_CONFLICT_FAILS})`);

  if (fails < MAX_CONFLICT_FAILS || entryFor(pull.number).rebuilt) return;

  rebuild(pull, {
    comments: pullComments(pull.number),
    stuck: "conflicted with main in a way that couldn't be resolved twice",
    log,
  });
}

function mergeMain(pull, log) {
  git(['fetch', '-q', 'origin', 'main', pull.headRefName], HOME_CHECKOUT);

  const dir = path.join(WORKTREES, `rebase-${pull.number}`);

  clearPath(dir);
  git(['worktree', 'add', '-q', '--detach', dir, `origin/${pull.headRefName}`], HOME_CHECKOUT);
  linkModules(dir);

  try {
    const merged = git(['merge', '--no-edit', 'origin/main'], dir, { allowFail: true }).ok;

    if (!merged && !resolveConflicts(pull, dir)) return false;

    git(['push', '-q', 'origin', `HEAD:${pull.headRefName}`], dir);
    log(`#${pull.number}: brought up to date with main`);

    return true;
  } finally {
    close({ dir });
  }
}

function bringUpToDate(pull, log) {
  if (!mergeMain(pull, log)) giveUp(pull, log);
}

function claimFirst(pulls) {
  for (const pull of pulls) {
    const release = claim(`pull-${pull.number}`);

    if (release) return { pull, release };
  }

  return null;
}

const conflictsWithMain = (pull) =>
  pull.mergeable === 'CONFLICTING' ||
  (pull.mergeable === 'UNKNOWN' &&
    !run('git', ['merge-tree', '--write-tree', '--name-only', 'origin/main', `origin/${pull.headRefName}`], {
      cwd: HOME_CHECKOUT,
      allowFail: true,
    }).ok);

const behindMain = (pull) =>
  !run('git', ['merge-base', '--is-ancestor', 'origin/main', `origin/${pull.headRefName}`], {
    cwd: HOME_CHECKOUT,
    allowFail: true,
  }).ok;

function staleFailures(pulls) {
  if (lastFinishedMainCheck()?.conclusion !== 'success') return [];

  const failed = pulls.filter((pull) => pullCheck(pull) === 'failure');

  return failed.filter(behindMain);
}

export default function rebase({ log }) {
  const pulls = openPulls()
    .filter((pull) => pull.headRefName.startsWith('loop/'))
    .sort(byRank);

  run('git', ['fetch', '-q', '--prune', 'origin'], { cwd: HOME_CHECKOUT, allowFail: true });

  const conflicting = pulls.filter(conflictsWithMain);
  const next = claimFirst(conflicting) ?? claimFirst(staleFailures(pulls));

  if (!next) {
    log('nothing to bring up to date');

    return;
  }

  try {
    bringUpToDate(next.pull, log);
  } finally {
    next.release();
  }
}
