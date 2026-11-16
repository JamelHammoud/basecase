import fs from 'node:fs';
import path from 'node:path';
import { HOME_CHECKOUT, WORKTREES } from './paths.mjs';
import { run } from './sh.mjs';
import { hasPendingDelivery, hasPendingWorktree } from './deliveryState.mjs';
import { hasRecovery } from './workRecovery.mjs';

import { fetchGit } from './gitFetch.mjs';

const git = (args, opts = {}) => run('git', args, { cwd: HOME_CHECKOUT, ...opts });

const stamp = () => `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}-${process.pid}`;

const safeSlug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'change';

export function clearPath(dir) {
  if (hasPendingWorktree(dir) || hasRecovery(dir)) throw new Error('Worktree has retained work');

  git(['worktree', 'remove', '--force', dir], { allowFail: true });
  fs.rmSync(dir, { recursive: true, force: true });
  git(['worktree', 'prune'], { allowFail: true });
}

export const linkModules = (dir) => {
  const target = path.join(HOME_CHECKOUT, 'node_modules');

  if (fs.existsSync(target)) fs.symlinkSync(target, path.join(dir, 'node_modules'));
};

export function openBranch(lane, slug, { timeout } = {}) {
  fetchGit(['-q', 'origin', 'main'], { timeout });

  const branch = `loop/${lane}/${safeSlug(slug)}-${stamp()}`;
  const dir = path.join(WORKTREES, branch.replaceAll('/', '-'));

  clearPath(dir);
  git(['worktree', 'add', '-q', '-b', branch, dir, 'origin/main'], { timeout });
  linkModules(dir);

  return { dir, branch };
}

export function openPullHead(number, sha) {
  fetchGit(['-q', 'origin', 'main', `pull/${number}/head`]);

  const dir = path.join(WORKTREES, `review-${number}-${sha.slice(0, 7)}`);

  clearPath(dir);
  git(['worktree', 'add', '-q', '--detach', dir, sha]);
  linkModules(dir);

  return { dir };
}

export function close({ dir, branch }) {
  if (hasPendingDelivery(branch) || hasPendingWorktree(dir) || hasRecovery(dir)) return;

  git(['worktree', 'remove', '--force', dir], { allowFail: true });

  if (branch) git(['branch', '-D', branch], { allowFail: true });
}
