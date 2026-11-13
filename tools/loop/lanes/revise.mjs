import path from 'node:path';
import { creditProblems } from '../credit.mjs';
import { runAgent } from '../lib/agent.mjs';
import { claim } from '../lib/claim.mjs';
import {
  checkRunFor,
  editPullBody,
  editPullLabels,
  failedLog,
  isLoopComment,
  lastFinishedMainCheck,
  openPulls,
  pullCheck,
  pullComments,
  pullReview,
} from '../lib/github.mjs';
import { HOME_CHECKOUT, OWNER_LOGIN, WORKTREES } from '../lib/paths.mjs';
import { protectedIn, protectedList } from '../lib/protected.mjs';
import { entryFor, markLooked, recordAttempt } from '../lib/reviseState.mjs';
import { run } from '../lib/sh.mjs';
import { clearPath, close, linkModules } from '../lib/worktree.mjs';
import { rebuild } from '../lib/rebuild.mjs';

export const schedule = {
  slots: 4,
  everySeconds: 60,
  labels: ['loop:revising'],
  does: "Answers a failed review, a pull request's own Check failure or a comment from Jamel on its branch, and rebuilds a change from main after four failed attempts",
};

const MAX_ATTEMPTS = 4;
const REVISING = 'loop:revising';
const MAX_LOG = 60_000;

const SCHEMA = {
  type: 'object',
  properties: {
    changed: { type: 'boolean' },
    commitMessage: { type: 'string', description: 'A subject line, a blank line, then what was answered and why' },
    revision: {
      type: 'string',
      description:
        'One line for the pull request body: what this revision changed, and why for any protected path it touched',
    },
    notes: { type: 'string' },
  },
  required: ['changed', 'commitMessage', 'revision', 'notes'],
};

const git = (args, cwd, opts = {}) => run('git', args, { cwd, ...opts });

const jamelComments = (comments) =>
  comments.filter((comment) => comment.author === OWNER_LOGIN && !isLoopComment(comment));

function needFor(pull, mainGreen) {
  if (!pull.headRefName.startsWith('loop/')) return null;

  const entry = entryFor(pull.number);
  const failing =
    pullReview(pull) === 'failure' ||
    ((mainGreen || pull.headRefName.startsWith('loop/repair/')) && pullCheck(pull) === 'failure');
  const newHead = !entry.heads.includes(pull.headRefOid);

  if (failing && newHead) return { entry, reason: pullReview(pull) === 'failure' ? 'review' : 'check' };

  return pull.updatedAt > entry.lastLook ? { entry, reason: 'maybe-jamel' } : null;
}

function evidence(pull, reason, comments) {
  const reviews = comments.filter((c) => c.body.startsWith('### Review:')).map((c) => c.body);
  const jamel = jamelComments(comments).map((c) => `Jamel (${c.createdAt}): ${c.body}`);
  const parts = [`Jamel's comments, newest last, which come first:\n\n${jamel.join('\n\n') || 'None.'}`];

  if (reason === 'review') parts.push(`The review lane's findings on the current head:\n\n${reviews.at(-1) ?? ''}`);

  if (reason === 'check') {
    const runInfo = checkRunFor(pull.headRefOid);

    parts.push(`Its Check failed. The failed log:\n\n${runInfo ? failedLog(runInfo.databaseId).slice(-MAX_LOG) : ''}`);
  }

  return parts.join('\n\n');
}

function checkout(pull) {
  git(['fetch', '-q', 'origin', 'main', pull.headRefName], HOME_CHECKOUT);

  const dir = path.join(WORKTREES, `revise-${pull.number}`);

  clearPath(dir);
  git(['worktree', 'add', '-q', '-B', pull.headRefName, dir, `origin/${pull.headRefName}`], HOME_CHECKOUT);
  linkModules(dir);

  return { dir };
}

function publishRevision(pull, { dir, output }) {
  const problems = creditProblems(output.commitMessage);

  if (problems.length > 0) throw new Error(`Commit message credits a model or tool: ${problems.join('; ')}`);

  git(['add', '-A'], dir);
  git(['commit', '-q', '-F', '-'], dir, { input: output.commitMessage });
  run('node', [path.join(HOME_CHECKOUT, 'tools', 'check-credit.mjs'), 'origin/main..HEAD'], { cwd: dir });
  git(['push', '-q', 'origin', `HEAD:${pull.headRefName}`], dir);

  const heading = pull.body.includes('\n## Revisions\n') ? '' : '\n\n## Revisions\n';
  const touched = protectedIn('HEAD~1..HEAD', dir);
  const line =
    touched.length === 0 ? output.revision : `${output.revision} Protected paths: ${protectedList(touched)}.`;

  editPullBody(pull.number, `${pull.body}${heading}\n- ${line}`);
}

function revisePull(pull, { reason, comments, jamelAt }, log) {
  const worktree = checkout(pull);

  try {
    if (!git(['merge', '-q', '--no-edit', 'origin/main'], worktree.dir, { allowFail: true }).ok) {
      git(['merge', '--abort'], worktree.dir, { allowFail: true });
      log(`#${pull.number}: conflicts with main; the rebase lane resolves those first`);

      return;
    }

    recordAttempt(pull.number, { head: pull.headRefOid, jamelAt });

    const prompt = `Revise pull request #${pull.number}: ${pull.title}\n\n${pull.body}\n\n${evidence(pull, reason, comments)}`;
    const result = runAgent({ cwd: worktree.dir, name: 'revise', prompt, schema: SCHEMA, hours: 4 });

    if (!result.ok || !result.output.changed) {
      log(`#${pull.number}: nothing to change: ${String(result.error ?? result.output.notes).slice(0, 400)}`);

      return;
    }

    publishRevision(pull, { dir: worktree.dir, output: result.output });
    log(`#${pull.number}: revised for ${reason}: ${result.output.revision}`);
  } finally {
    close(worktree);
  }
}

function handle(pull, need, log) {
  const comments = pullComments(pull.number);
  const latestJamel = jamelComments(comments).at(-1)?.createdAt ?? '';
  const jamelNew = latestJamel > need.entry.lastJamel;
  const jamelReason = jamelNew ? 'jamel' : null;
  const reason = need.reason === 'maybe-jamel' ? jamelReason : need.reason;

  if (!reason) return;

  editPullLabels(pull.number, { add: [REVISING] });

  try {
    if (need.entry.attempts >= MAX_ATTEMPTS && !need.entry.rebuilt && reason !== 'jamel') {
      rebuild(pull, { comments, log });

      return;
    }

    revisePull(pull, { reason, comments, jamelAt: latestJamel }, log);
  } finally {
    editPullLabels(pull.number, { remove: [REVISING] });
  }
}

export default function revise({ log }) {
  const mainGreen = lastFinishedMainCheck()?.conclusion === 'success';

  for (const pull of openPulls()) {
    const need = needFor(pull, mainGreen);
    const release = need ? claim(`pull-${pull.number}`) : null;

    if (!release) continue;

    try {
      handle(pull, need, log);
    } finally {
      markLooked(pull.number, new Date().toISOString());
      release();
    }

    return;
  }

  log('nothing to revise');
}
