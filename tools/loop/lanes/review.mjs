import { updateSession } from '../lib/sessionJournal.mjs';
import { creditProblems } from '../credit.mjs';
import { runAgent } from '../lib/agent.mjs';
import { claim } from '../lib/claim.mjs';
import { copyReport } from '../lib/copy.mjs';
import { fetchAll, ownPatchId, resolveSha } from '../lib/branches.mjs';
import {
  closePull,
  commentOnPull,
  openPulls,
  pullCheck,
  pullComments,
  pullReview,
  reviewState,
  setReview,
} from '../lib/github.mjs';
import { duplicateTarget, inFlight, inFlightText } from '../lib/inFlight.mjs';
import { byRank } from '../lib/rank.mjs';
import { isSmall } from '../lib/smallChange.mjs';
import { run } from '../lib/sh.mjs';
import { reviewPrompt } from '../lib/reviewPrompt.mjs';
import { voiceNewPages } from '../lib/voiceHook.mjs';
import { close, openPullHead } from '../lib/worktree.mjs';
import { hasPendingDelivery } from '../lib/deliveryState.mjs';

export const schedule = {
  agent: true,
  slots: 8,
  everySeconds: 60,
  does: 'Reviews each pull request whose head has no agent-review status',
};

const MAX_DIFF = 400_000;

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    summary: { type: 'string' },
    duplicateOf: { type: 'integer' },
    fixed: { type: 'array', items: { type: 'string' }, description: 'One line per finding you fixed in the worktree' },
    commitMessage: { type: 'string', description: 'A subject line, a blank line, then what you fixed and why' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['blocker', 'minor'] },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['file', 'severity', 'problem', 'fix'],
      },
    },
  },
  required: ['verdict', 'summary', 'findings'],
};

const findingLine = (f) => `- **${f.severity}** \`${f.file}${f.line ? `:${f.line}` : ''}\`: ${f.problem} Fix: ${f.fix}`;

const fenced = (text) => ['```', text, '```'].join('\n');

const reviewComment = ({ verdict, summary, findings, fixed = [] }, { sha, copy }) =>
  [
    `### Review: ${verdict === 'pass' ? 'pass' : 'changes needed'} (${sha.slice(0, 7)})`,
    summary,
    ...(fixed.length > 0 ? ['', 'Fixed in this review:', ...fixed.map((line) => `- ${line}`)] : []),
    ...(findings.length > 0 ? ['', ...findings.map(findingLine)] : []),
    '',
    fenced(copy.text),
  ].join('\n');

function ontoMain(dir, body) {
  const diff = run('git', ['diff', 'origin/main...HEAD'], { cwd: dir }).out.slice(0, MAX_DIFF);
  const copy = copyReport(dir, { body });
  const onMain = run('git', ['merge', '-q', '--no-edit', 'origin/main'], { cwd: dir, allowFail: true }).ok;

  if (!onMain) run('git', ['merge', '--abort'], { cwd: dir, allowFail: true });

  return { diff, copy, onMain };
}

const FIX_IT =
  'Fix every finding you can, here in the worktree: blockers and minors, code, tests, copy and docs. Run `npm run check:changed -- <files>` on what you change. List each fix in `fixed` and write a commit message in `commitMessage`. Leave in `findings` only what you could not fix, and pass the pull request when nothing left blocks it.';

function pushFixes({ pull, worktree, judged, log }) {
  const dir = worktree.dir;

  if (!judged.fixed?.length || run('git', ['status', '--porcelain'], { cwd: dir }).out === '') return null;

  const message = judged.commitMessage || `Fix the review findings on #${pull.number}`;
  const hold = claim(`pull-${pull.number}`);

  if (!hold || creditProblems(message).length > 0) return hold?.() ?? null;

  try {
    voiceNewPages(dir);
    run('git', ['add', '-A'], { cwd: dir });

    const committed = run('git', ['commit', '-q', '-F', '-'], { cwd: dir, input: message, allowFail: true }).ok;
    const pushed =
      committed && run('git', ['push', '-q', 'origin', `HEAD:${pull.headRefName}`], { cwd: dir, allowFail: true }).ok;

    if (!pushed) return log(`#${pull.number}: couldn't push the review's fixes; reviewing as it stands`) ?? null;

    return run('git', ['rev-parse', 'HEAD'], { cwd: dir }).out.trim();
  } finally {
    hold();
  }
}

function judge({ pull, worktree, diff, copy, onMain, log }) {
  const where = onMain
    ? 'The worktree is the pull request merged onto current main, so judge it as it would land.'
    : 'It conflicts with current main, so the worktree is its own head; the rebase lane will bring it up to date.';
  const others = inFlight();
  const duplicates = `Other pull requests, open or merged in the last day:\n\n${inFlightText({ ...others, except: pull.number })}\n\nIf one of them makes this same change (the same strings or the same behaviour, not merely the same area), set duplicateOf to its number.`;
  const prompt = reviewPrompt({ pull, where, copy, duplicates, fix: FIX_IT, diff });
  const result = runAgent({ cwd: worktree.dir, name: 'review', prompt, schema: SCHEMA, hours: 2 });

  if (!result.ok) {
    setReview(pull.headRefOid, 'error', 'The review session failed; it will run again');
    log(`#${pull.number}: review session failed: ${String(result.error).slice(0, 500)}`);

    return null;
  }

  const original = duplicateTarget({ duplicateOf: result.output.duplicateOf, pull, ...others });

  if (!original) return { ...result.output, journalId: result.journalId };

  updateSession(result.journalId, { reviewOutcome: 'duplicate' });

  closePull(pull.number, `Closing as a duplicate of #${original}, which makes the same change.`);
  log(`#${pull.number}: duplicate of #${original}; closed`);

  return null;
}

function report({ pull, head, judged, copy, fixed, log }) {
  const blockers = judged.findings.filter((f) => f.severity === 'blocker');
  const verdict = judged.verdict === 'pass' && blockers.length === 0 ? 'pass' : 'fail';
  const fixes = fixed ? `, fixed ${judged.fixed.length} in ${head.slice(0, 7)}` : '';

  commentOnPull(pull.number, reviewComment({ ...judged, verdict }, { sha: head, copy }));
  updateSession(judged.journalId, { reviewOutcome: verdict });
  setReview(head, verdict === 'pass' ? 'success' : 'failure', judged.summary);
  log(`#${pull.number}: ${verdict}, ${blockers.length} blockers${fixes}`);
}

function reviewPull(pull, log) {
  const sha = pull.headRefOid;
  const worktree = openPullHead(pull.number, sha);

  try {
    setReview(sha, 'pending', 'Reviewing');

    const { diff, copy, onMain } = ontoMain(worktree.dir, pull.body);
    const judged = judge({ pull, worktree, diff, copy, onMain, log });

    if (!judged) return;

    const fixedSha = pushFixes({ pull, worktree, judged, log });

    report({ pull, head: fixedSha ?? sha, judged, copy, fixed: Boolean(fixedSha), log });
  } finally {
    close(worktree);
  }
}

const REVIEWED = /^### Review: [^(]*\(([0-9a-f]{7,40})\)/;

const lastReviewedSha = (pull) =>
  pullComments(pull.number)
    .map((comment) => REVIEWED.exec(comment.body)?.[1])
    .filter(Boolean)
    .at(-1);

function carryOver(pull, log) {
  const short = lastReviewedSha(pull);
  const reviewed = short ? resolveSha(short) : null;

  if (!reviewed || reviewed === pull.headRefOid) return false;

  const before = ownPatchId(reviewed);

  if (before === null || before !== ownPatchId(pull.headRefOid)) return false;

  const state = reviewState(reviewed);

  if (!['success', 'failure'].includes(state)) return false;

  setReview(pull.headRefOid, state, `Carried over from ${short}: only main changed since`);
  log(`#${pull.number}: review of ${short} carried over (${state}); only main changed`);

  return true;
}

export default function review({ log }) {
  fetchAll();

  const waiting = openPulls()
    .filter((pull) => !hasPendingDelivery(pull.headRefName))
    .filter((pull) => {
      const state = pullReview(pull);

      return (state === null || state === 'error') && pull.mergeable !== 'CONFLICTING' && pullCheck(pull) !== 'failure';
    })
    .sort((a, b) => Number(pullCheck(b) === 'success') - Number(pullCheck(a) === 'success') || byRank(a, b));

  for (const pull of waiting) {
    if (isSmall(pull)) {
      setReview(pull.headRefOid, 'success', 'Small change: it lands on its Check without an agent review');
      log(`#${pull.number}: small change; no agent review`);

      continue;
    }

    const release = claim(`review-${pull.number}`);

    if (!release) continue;

    try {
      if (!carryOver(pull, log)) reviewPull(pull, log);
    } catch (error) {
      setReview(pull.headRefOid, 'error', 'The review stopped before it finished; it will run again');

      throw error;
    } finally {
      release();
    }

    return;
  }

  if (waiting.length === 0) log('nothing to review');
}
