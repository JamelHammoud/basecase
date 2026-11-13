import path from 'node:path';

export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const LOOP_WORKTREE = /^(loop|review|rebase)-/;

export const isLoopBranch = (name) =>
  typeof name === 'string' && name.startsWith('loop/') && name.length > 'loop/'.length;

export function parseRefs(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, seconds] = line.trim().split(/\s+/);

      return { name, committedAt: Number(seconds) * 1000 };
    });
}

export function parseWorktrees(porcelain) {
  return porcelain
    .split(/\n\s*\n/)
    .map((block) => block.split('\n'))
    .map((fields) => ({
      dir: fields.find((f) => f.startsWith('worktree '))?.slice('worktree '.length),
      branch: fields.find((f) => f.startsWith('branch refs/heads/'))?.slice('branch refs/heads/'.length) ?? null,
    }))
    .filter((worktree) => worktree.dir);
}

export const laneOf = (name) => name.replace(/^loop-/, '').split('-')[0];

export const staleBranches = ({ branches, keep, now, maxAgeMs = STALE_AFTER_MS }) =>
  branches
    .filter((branch) => isLoopBranch(branch.name))
    .filter((branch) => !keep.includes(branch.name))
    .filter((branch) => now - branch.committedAt > maxAgeMs)
    .map((branch) => branch.name);

const laneHeld = (lane, held) => held.some((id) => id === lane || id.startsWith(`${lane}-`));

export const staleWorktrees = ({ worktrees, root, held, now, maxAgeMs = STALE_AFTER_MS }) =>
  worktrees
    .filter((w) => path.resolve(path.dirname(w.dir)) === path.resolve(root))
    .filter((w) => LOOP_WORKTREE.test(path.basename(w.dir)))
    .filter((w) => !laneHeld(laneOf(path.basename(w.dir)), held))
    .filter((w) => now - w.createdAt > maxAgeMs);
