import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HARNESS_EXCLUDES, harnessKey } from './cache.mjs';

export const SHARED_PATHS = [
  { path: 'bench/micro', what: 'tasks and graders' },
  { path: 'package-lock.json', what: 'dependencies' },
];

const git = (cwd, args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export const refFromArgs = (args) => {
  const next = args[args.indexOf('--against') + 1];

  return next && !next.startsWith('--') ? next : 'main';
};

export const refLabel = (ref) => (/^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 7) : ref);

export function checkoutRef({ cwd, ref }) {
  const commit = git(cwd, ['rev-parse', '--verify', `${ref}^{commit}`]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-bench-ref-'));

  git(cwd, ['worktree', 'add', '--quiet', '--detach', dir, commit]);

  const remove = () => {
    try {
      git(cwd, ['worktree', 'remove', '--force', dir]);
    } catch {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  return { ref, label: refLabel(ref), commit, dir, remove };
}

export function harnessPair({ tree, ref }) {
  const differ = SHARED_PATHS.filter(
    ({ path: p }) => harnessKey(tree, [p, ...HARNESS_EXCLUDES]) !== harnessKey(ref.dir, [p, ...HARNESS_EXCLUDES]),
  );

  if (differ.length > 0)
    throw new Error(
      `The working tree and ${ref.label} have different ${differ.map((d) => `${d.what} (${d.path})`).join(' and ')}, so their runs can't be compared. Compare harnesses that share them.`,
    );

  const keys = { tree: harnessKey(tree), ref: harnessKey(ref.dir) };

  if (keys.tree === keys.ref)
    throw new Error(
      `The working tree and ${ref.label} have the same harness (${keys.tree}): nothing the agent depends on differs, so there's nothing to compare.`,
    );

  return keys;
}
