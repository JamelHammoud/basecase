import path from 'node:path';
import { runAgent } from '../lib/agent.mjs';
import { claim } from '../lib/claim.mjs';
import { behindMain, conflictsWithMain, fetchAll } from '../lib/branches.mjs';
import { openPulls, pullCheck, pullComments, pullReview } from '../lib/github.mjs';
import { HOME_CHECKOUT, WORKTREES } from '../lib/paths.mjs';
import { entryFor, markRefreshed, recordConflictFail } from '../lib/pullState.mjs';
import { byRank } from '../lib/rank.mjs';
import { rebuild } from '../lib/rebuild.mjs';
import { run } from '../lib/sh.mjs';
import { clearPath, close, linkModules } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 3,
  everySeconds: 60,
  does: 'Merges main into conflicting loop/ branches, an agent resolving the conflicts, rebuilds a change whose conflicts fail twice, and refreshes a failed Check once per head',
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

  return commitResolution(dir);
}

function commitResolution(dir) {
  git(['add', '-A'], dir);

  const first = git(['commit', '-q', '--no-edit'], dir, { allowFail: true });

  if (first.ok) return true;

  const hook = `${first.err}\n${first.out}`.slice(-6000);
  const prompt = `The conflicts are resolved, but the commit hook rejected the merge:\n\n${hook}\n\nFix what it reports without changing behaviour (for a file over the line limit, move a cohesive part into a sibling module). Then answer resolved.`;
  const fixed = runAgent({ cwd: dir, name: 'rebase', prompt, schema: SCHEMA, hours: 1 });

  if (!fixed.ok || !fixed.output.resolved) return false;

  git(['add', '-A'], dir);

  return git(['commit', '-q', '--no-edit'], dir, { allowFail: true }).ok;
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

function merged(pull, dir, log) {
  try {
    return git(['merge', '--no-edit', 'origin/main'], dir, { allowFail: true }).ok || resolveConflicts(pull, dir);
  } catch (error) {
    log(`#${pull.number}: resolving the conflicts failed: ${String(error.message).slice(0, 300)}`);

    return false;
  }
}

function mergeMain(pull, log) {
  git(['fetch', '-q', 'origin', 'main', pull.headRefName], HOME_CHECKOUT);

  const dir = path.join(WORKTREES, `rebase-${pull.number}`);

  clearPath(dir);
  git(['worktree', 'add', '-q', '--detach', dir, `origin/${pull.headRefName}`], HOME_CHECKOUT);
  linkModules(dir);

  try {
    if (!merged(pull, dir, log)) return false;

    git(['push', '-q', 'origin', `HEAD:${pull.headRefName}`], dir);
    markRefreshed(pull.number, git(['rev-parse', 'HEAD'], dir).out.trim());
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

function staleFailures(pulls) {
  const refreshable = (pull) =>
    pullCheck(pull) === 'failure' &&
    pullReview(pull) !== 'failure' &&
    !entryFor(pull.number).refreshed.includes(pull.headRefOid);

  return pulls.filter(refreshable).filter(behindMain);
}

export default function rebase({ log }) {
  const pulls = openPulls()
    .filter((pull) => pull.headRefName.startsWith('loop/'))
    .sort(byRank);

  fetchAll();

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
