import fs from 'node:fs';
import path from 'node:path';
import { openHeads } from '../lib/history.mjs';
import { heldLocks } from '../lib/locks.mjs';
import { HOME_CHECKOUT, HOME_REF, WORKTREES } from '../lib/paths.mjs';
import { run } from '../lib/sh.mjs';
import { isLoopBranch, parseRefs, parseWorktrees, staleBranches, staleWorktrees } from '../lib/stale.mjs';

const git = (args, opts = {}) => run('git', args, { cwd: HOME_CHECKOUT, ...opts });

const REF_FORMAT = '--format=%(refname:lstrip=3) %(committerdate:unix)';
const LOCAL_FORMAT = '--format=%(refname:lstrip=2) %(committerdate:unix)';

const worktrees = () => parseWorktrees(git(['worktree', 'list', '--porcelain']).out);

function deleteRemoteBranches(log, now) {
  git(['fetch', '-q', '--prune', 'origin', '+refs/heads/loop/*:refs/remotes/origin/loop/*']);

  const branches = parseRefs(git(['for-each-ref', REF_FORMAT, 'refs/remotes/origin/loop']).out);
  const stale = staleBranches({ branches, keep: [...openHeads(), HOME_REF], now });

  for (const name of stale) {
    const { ok, err } = git(['push', '-q', 'origin', '--delete', name], { allowFail: true });

    log(ok ? `deleted remote ${name}` : `could not delete remote ${name}: ${err}`);
  }
}

function removeWorktrees(log, now) {
  const listed = worktrees()
    .filter((w) => fs.existsSync(w.dir))
    .map((w) => ({ ...w, createdAt: fs.statSync(w.dir).birthtimeMs || fs.statSync(w.dir).ctimeMs }));
  const stale = staleWorktrees({ worktrees: listed, root: WORKTREES, held: heldLocks(), now });

  for (const worktree of stale) {
    git(['worktree', 'remove', '--force', worktree.dir], { allowFail: true });
    log(`removed worktree ${path.basename(worktree.dir)}`);

    if (isLoopBranch(worktree.branch)) git(['branch', '-D', worktree.branch], { allowFail: true });
  }
}

function deleteLocalBranches(log, now) {
  const checkedOut = worktrees()
    .map((w) => w.branch)
    .filter(Boolean);
  const branches = parseRefs(git(['for-each-ref', LOCAL_FORMAT, 'refs/heads/loop']).out);

  for (const name of staleBranches({ branches, keep: checkedOut, now })) {
    git(['branch', '-D', name], { allowFail: true });
    log(`deleted local ${name}`);
  }
}

export default function tidy({ log }) {
  const now = Date.now();

  deleteRemoteBranches(log, now);
  removeWorktrees(log, now);
  git(['worktree', 'prune']);
  deleteLocalBranches(log, now);
}
