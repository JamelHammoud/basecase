import { HOME_CHECKOUT } from './paths.mjs';
import { run } from './sh.mjs';

const git = (args) => run('git', args, { cwd: HOME_CHECKOUT, allowFail: true });

export const fetchAll = () => git(['fetch', '-q', '--prune', 'origin']);

export const conflictsWithMain = (pull) =>
  pull.mergeable === 'CONFLICTING' ||
  (pull.mergeable === 'UNKNOWN' &&
    !git(['merge-tree', '--write-tree', '--name-only', 'origin/main', `origin/${pull.headRefName}`]).ok);

export const behindMain = (pull) =>
  !git(['merge-base', '--is-ancestor', 'origin/main', `origin/${pull.headRefName}`]).ok;

export function ownPatchId(sha) {
  const base = git(['merge-base', 'origin/main', sha]).out.trim();

  if (!base) return null;

  const diff = git(['diff', '-U0', base, sha]).out;

  if (!diff) return null;

  return (
    run('git', ['patch-id', '--stable'], { cwd: HOME_CHECKOUT, input: diff, allowFail: true }).out.split(' ')[0] || null
  );
}

export const resolveSha = (short) => git(['rev-parse', '--verify', '--quiet', `${short}^{commit}`]).out.trim() || null;
