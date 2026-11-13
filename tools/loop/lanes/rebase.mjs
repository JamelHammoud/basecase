import path from 'node:path';
import { runAgent } from '../lib/agent.mjs';
import { openPulls } from '../lib/github.mjs';
import { HOME_CHECKOUT, WORKTREES } from '../lib/paths.mjs';
import { run } from '../lib/sh.mjs';
import { close } from '../lib/worktree.mjs';

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

  git(['worktree', 'add', '-q', '-B', pull.headRefName, dir, `origin/${pull.headRefName}`], HOME_CHECKOUT);

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

export default function rebase({ log }) {
  const pull = openPulls().find((p) => p.headRefName.startsWith('loop/') && p.mergeable === 'CONFLICTING');

  if (!pull) {
    log('no conflicts');

    return;
  }

  bringUpToDate(pull, log);
}
