import fs from 'node:fs';
import path from 'node:path';
import { HOME_CHECKOUT, WORKTREES } from './paths.mjs';
import { run } from './sh.mjs';

const git = (args, opts = {}) => run('git', args, { cwd: HOME_CHECKOUT, ...opts });

const stamp = () => `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}-${process.pid}`;

const safeSlug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'change';

export function clearPath(dir) {
  git(['worktree', 'remove', '--force', dir], { allowFail: true });
  fs.rmSync(dir, { recursive: true, force: true });
  git(['worktree', 'prune'], { allowFail: true });
}

export const linkModules = (dir) => {
  const target = path.join(HOME_CHECKOUT, 'node_modules');

  if (fs.existsSync(target)) fs.symlinkSync(target, path.join(dir, 'node_modules'));
};

export function openBranch(lane, slug) {
  git(['fetch', '-q', 'origin', 'main']);

  const branch = `loop/${lane}/${safeSlug(slug)}-${stamp()}`;
  const dir = path.join(WORKTREES, branch.replaceAll('/', '-'));

  clearPath(dir);
  git(['worktree', 'add', '-q', '-b', branch, dir, 'origin/main']);
  linkModules(dir);

  return { dir, branch };
}

export function openPullHead(number, sha) {
  git(['fetch', '-q', 'origin', 'main', `pull/${number}/head`]);

  const dir = path.join(WORKTREES, `review-${number}-${sha.slice(0, 7)}`);

  clearPath(dir);
  git(['worktree', 'add', '-q', '--detach', dir, sha]);
  linkModules(dir);

  return { dir };
}

export function close({ dir, branch }) {
  git(['worktree', 'remove', '--force', dir], { allowFail: true });

  if (branch) git(['branch', '-D', branch], { allowFail: true });
}
