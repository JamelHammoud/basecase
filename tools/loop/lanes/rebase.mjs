import path from 'node:path';
import { runAgent } from '../lib/agent.mjs';
import { lastFinishedMainCheck, openPulls, pullCheck } from '../lib/github.mjs';
import { HOME_CHECKOUT, WORKTREES } from '../lib/paths.mjs';
import { run } from '../lib/sh.mjs';
import { claim } from '../lib/claim.mjs';
import { clearPath, close, linkModules } from '../lib/worktree.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 60,
  does: 'Merges main into a conflicting loop/ branch, an agent resolving the conflicts, and refreshes a pull request whose Check failed on an older main',
};

const SCHEMA = {
  type: 'object',
  properties: { resolved: { type: 'boolean' }, notes: { type: 'string' } },
  required: ['resolved', 'notes'],
};

const git = (args, cwd, opts = {}) => run('git', args, { cwd, ...opts });

function resolveConflicts(pull, dir) {
  const prompt = `Merging main into pull request #${pull.number} (${pull.title}) left conflicts. Resolve every conflict so both sides' intent survives, then run npm run check:changed on the files you touched. Don't commit.`;
  const result = runAgent({ cwd: dir, name: 'rebase', prompt, schema: SCHEMA, hours: 2 });
  const clean = git(['diff', '--check'], dir, { allowFail: true }).ok;

  if (!result.ok || !result.output.resolved || !clean) return false;

  git(['add', '-A'], dir);
  git(['commit', '-q', '--no-edit'], dir);

  return true;
}

function bringUpToDate(pull, log) {
  git(['fetch', '-q', 'origin', 'main', pull.headRefName], HOME_CHECKOUT);

  const dir = path.join(WORKTREES, `rebase-${pull.number}`);

  clearPath(dir);
  git(['worktree', 'add', '-q', '-B', pull.headRefName, dir, `origin/${pull.headRefName}`], HOME_CHECKOUT);
  linkModules(dir);

  try {
    const merged = git(['merge', '--no-edit', 'origin/main'], dir, { allowFail: true }).ok;

    if (!merged && !resolveConflicts(pull, dir)) {
      git(['merge', '--abort'], dir, { allowFail: true });
      log(`#${pull.number}: conflicts left unresolved`);

      return;
    }

    git(['push', '-q', 'origin', `HEAD:${pull.headRefName}`], dir);
    log(`#${pull.number}: brought up to date with main`);
  } finally {
    close({ dir });
  }
}

const isLoop = (pull) => pull.headRefName.startsWith('loop/');

function withClaim(pull, log) {
  const release = claim(`pull-${pull.number}`);

  if (!release) {
    log(`#${pull.number}: another lane is working on it`);

    return;
  }

  try {
    bringUpToDate(pull, log);
  } finally {
    release();
  }
}

const behindMain = (pull) => {
  run('git', ['fetch', '-q', 'origin', 'main', pull.headRefName], { cwd: HOME_CHECKOUT });

  return !run('git', ['merge-base', '--is-ancestor', 'origin/main', `origin/${pull.headRefName}`], {
    cwd: HOME_CHECKOUT,
    allowFail: true,
  }).ok;
};

const failedOnOldMain = (pull, mainGreen) => mainGreen && pullCheck(pull) === 'failure' && behindMain(pull);

export default function rebase({ log }) {
  const pulls = openPulls().filter(isLoop);
  const conflicting = pulls.find((p) => p.mergeable === 'CONFLICTING');

  if (conflicting) {
    withClaim(conflicting, log);

    return;
  }

  const mainGreen = lastFinishedMainCheck()?.conclusion === 'success';
  const stale = pulls.find((p) => failedOnOldMain(p, mainGreen));

  if (!stale) {
    log('nothing to bring up to date');

    return;
  }

  withClaim(stale, log);
}
