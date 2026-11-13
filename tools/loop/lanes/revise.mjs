import path from 'node:path';
import { creditProblems } from '../credit.mjs';
import { runAgent } from '../lib/agent.mjs';
import { claim } from '../lib/claim.mjs';
import {
  checkConclusion,
  checkRunFor,
  commentOnPull,
  editPullBody,
  editPullLabels,
  failedLog,
  hasLabel,
  lastFinishedMainCheck,
  openPulls,
  pullComments,
  reviewState,
} from '../lib/github.mjs';
import { HOME_CHECKOUT, WORKTREES } from '../lib/paths.mjs';
import { run } from '../lib/sh.mjs';
import { clearPath, close } from '../lib/worktree.mjs';

export const schedule = {
  slots: 4,
  everySeconds: 60,
  labels: ['loop:revising', 'loop:stuck'],
  does: "Answers a failed review, a Check failure that's the pull request's own, or any Check failure on a repair, on its branch",
};

const MAX_ROUNDS = 4;
const STUCK = 'loop:stuck';
const REVISING = 'loop:revising';
const MAX_LOG = 60_000;

const SCHEMA = {
  type: 'object',
  properties: {
    changed: { type: 'boolean' },
    commitMessage: { type: 'string', description: 'A subject line, a blank line, then what was answered and why' },
    revision: { type: 'string', description: 'One line for the pull request body: what this revision changed' },
    notes: { type: 'string' },
  },
  required: ['changed', 'commitMessage', 'revision', 'notes'],
};

const git = (args, cwd, opts = {}) => run('git', args, { cwd, ...opts });

const reasonFor = (pull, mainGreen) => {
  if (!pull.headRefName.startsWith('loop/') || hasLabel(pull, STUCK)) return null;

  if (reviewState(pull.headRefOid) === 'failure') return 'review';

  const ownsFailures = mainGreen || pull.headRefName.startsWith('loop/repair/');

  return ownsFailures && checkConclusion(pull.headRefOid) === 'failure' ? 'check' : null;
};

const evidence = (pull, reason, reviews) => {
  if (reason === 'review') return `The review lane's findings on the current head:\n\n${reviews.at(-1) ?? ''}`;

  const runInfo = checkRunFor(pull.headRefOid);

  return `Its Check failed. Either main is green, so the failure is this pull request's, or this is a repair that has to turn Check fully green. The failed log:\n\n${runInfo ? failedLog(runInfo.databaseId).slice(-MAX_LOG) : 'unavailable'}`;
};

function checkout(pull) {
  git(['fetch', '-q', 'origin', 'main', pull.headRefName], HOME_CHECKOUT);

  const dir = path.join(WORKTREES, `revise-${pull.number}`);

  clearPath(dir);
  git(['worktree', 'add', '-q', '-B', pull.headRefName, dir, `origin/${pull.headRefName}`], HOME_CHECKOUT);

  const linked = path.join(HOME_CHECKOUT, 'node_modules');

  run('ln', ['-s', linked, path.join(dir, 'node_modules')], { allowFail: true });

  return { dir };
}

function giveUp(pull, rounds, log) {
  editPullLabels(pull.number, { add: [STUCK] });
  commentOnPull(
    pull.number,
    `Review has asked for changes ${rounds} times, so the loop has stopped revising this pull request. Close it, or give direction here.`,
  );
  log(`#${pull.number}: stuck after ${rounds} rounds`);
}

function publishRevision(pull, { dir, output }) {
  const problems = creditProblems(output.commitMessage);

  if (problems.length > 0) throw new Error(`Commit message credits a model or tool: ${problems.join('; ')}`);

  git(['add', '-A'], dir);
  git(['commit', '-q', '-F', '-'], dir, { input: output.commitMessage });
  run('node', [path.join(HOME_CHECKOUT, 'tools', 'check-credit.mjs'), 'origin/main..HEAD'], { cwd: dir });
  git(['push', '-q', 'origin', `HEAD:${pull.headRefName}`], dir);

  const heading = pull.body.includes('\n## Revisions\n') ? '' : '\n\n## Revisions\n';

  editPullBody(pull.number, `${pull.body}${heading}\n- ${output.revision}`);
}

function revisePull(pull, reason, log) {
  const reviews = pullComments(pull.number).filter((body) => body.startsWith('### Review:'));
  const rounds = reviews.filter((body) => body.startsWith('### Review: changes needed')).length;

  if (rounds >= MAX_ROUNDS) {
    giveUp(pull, rounds, log);

    return;
  }

  const worktree = checkout(pull);

  try {
    if (!git(['merge', '-q', '--no-edit', 'origin/main'], worktree.dir, { allowFail: true }).ok) {
      git(['merge', '--abort'], worktree.dir, { allowFail: true });
      log(`#${pull.number}: conflicts with main; leaving it to the rebase lane`);

      return;
    }

    const prompt = `Revise pull request #${pull.number}: ${pull.title}\n\n${pull.body}\n\n${evidence(pull, reason, reviews)}`;
    const result = runAgent({ cwd: worktree.dir, name: 'revise', prompt, schema: SCHEMA, hours: 4 });

    if (!result.ok || !result.output.changed) {
      log(`#${pull.number}: no revision: ${String(result.error ?? result.output.notes).slice(0, 400)}`);

      return;
    }

    publishRevision(pull, { dir: worktree.dir, output: result.output });
    log(`#${pull.number}: revised for ${reason}: ${result.output.revision}`);
  } finally {
    close(worktree);
  }
}

export default function revise({ log }) {
  const mainGreen = lastFinishedMainCheck()?.conclusion === 'success';

  for (const pull of openPulls()) {
    const reason = reasonFor(pull, mainGreen);
    const release = reason ? claim(`pull-${pull.number}`) : null;

    if (!release) continue;

    editPullLabels(pull.number, { add: [REVISING] });

    try {
      revisePull(pull, reason, log);
    } finally {
      editPullLabels(pull.number, { remove: [REVISING] });
      release();
    }

    return;
  }

  log('nothing to revise');
}
