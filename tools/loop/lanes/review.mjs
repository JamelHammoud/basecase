import { harnessKey, harnessKeyAt } from '../../../bench/compare/cache.mjs';
import { runAgent } from '../lib/agent.mjs';
import { runCompare, SETTINGS, settleEstimate, spentOn, unlinkRuns } from '../lib/benchRuns.mjs';
import { claim, claimWithin, held } from '../lib/claim.mjs';
import { copyReport, copyReviewNote } from '../lib/copy.mjs';
import { fetchAll, ownPatchId, resolveSha } from '../lib/branches.mjs';
import {
  closePull,
  commentOnPull,
  editComment,
  openPulls,
  pullCheck,
  pullComments,
  pullReview,
  repoVariable,
  reviewState,
  setReview,
} from '../lib/github.mjs';
import { budgetFrom, PULL_BUDGET, skipReason } from '../lib/harnessVerdict.mjs';
import { duplicateTarget, inFlight, inFlightText } from '../lib/inFlight.mjs';
import { OWNER_LOGIN } from '../lib/paths.mjs';
import { judgedPass, measurePull, needsMeasure, withMeasure } from '../lib/pullMeasure.mjs';
import { byRank } from '../lib/rank.mjs';
import { run } from '../lib/sh.mjs';
import { pause } from '../lib/usage.mjs';
import { close, openPullHead } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 8,
  everySeconds: 60,
  does: 'Reviews each pull request whose head has no agent-review status',
};

const MAX_DIFF = 400_000;
const BENCH_PORT = 5390;

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    summary: { type: 'string' },
    duplicateOf: { type: 'integer' },
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

const reviewComment = ({ verdict, summary, findings }, { sha, copy }) =>
  [
    `### Review: ${verdict === 'pass' ? 'pass' : 'changes needed'} (${sha.slice(0, 7)})`,
    summary,
    ...(findings.length > 0 ? ['', ...findings.map(findingLine)] : []),
    '',
    fenced(copy.text),
  ].join('\n');

const git = (dir, args) => run('git', args, { cwd: dir }).out;

function benchDeps({ dir, onMain, log }) {
  const mainCommit = git(dir, onMain ? ['rev-parse', 'origin/main'] : ['merge-base', 'HEAD', 'origin/main']);

  git(dir, ['reset', '-q', '--hard', 'HEAD']);
  git(dir, ['clean', '-fdq']);

  return {
    owner: OWNER_LOGIN,
    pullComments,
    commentOnPull,
    editComment,
    settings: SETTINGS,
    budget: () => budgetFrom(repoVariable('LOOP_PULL_BENCH_BUDGET'), PULL_BUDGET),
    paused: () => skipReason({ paused: pause(), pulls: [] }),
    keys: () => ({ branch: harnessKey(dir), main: harnessKeyAt(dir, mainCommit), mainCommit }),
    estimate: (keys) => settleEstimate(keys.main),
    compare: (plan) => runCompare({ dir, log, split: 'tune', port: BENCH_PORT, ...plan }),
    spentOn,
  };
}

const BENCH_WAIT_MS = 2 * 60 * 60 * 1000;

const BENCH_BUSY = {
  verdict: 'busy',
  description: "Another review's micro-evals held the bench; it will run again",
  log: 'waited two hours for the micro-evals bench; will run again',
};

const PULL_BUSY = {
  verdict: 'busy',
  description: 'Another lane held this pull request; the micro-evals will run again',
  log: 'another lane held the pull request; micro-evals will run again',
};

function onBench(sha, measure) {
  setReview(sha, 'pending', 'Waiting for the micro-evals');

  const release = claimWithin('pull-bench', { ms: BENCH_WAIT_MS });

  if (!release) return BENCH_BUSY;

  try {
    setReview(sha, 'pending', 'Measuring on the micro-evals');

    return measure();
  } finally {
    release();
  }
}

function measureOnce({ pull, paths, log, worktree, onMain }) {
  if (!needsMeasure(pull, paths)) return null;

  const hold = claim(`pull-${pull.number}`);

  if (!hold) return PULL_BUSY;

  try {
    return onBench(pull.headRefOid, () => measurePull({ pull, paths, log }, benchDeps({ ...worktree, onMain, log })));
  } finally {
    hold();
  }
}

const changedFiles = (dir) =>
  git(dir, ['diff', '--name-only', '--no-renames', '-z', 'origin/main...HEAD']).split('\0').filter(Boolean);

function reviewPull(pull, log) {
  const sha = pull.headRefOid;
  const worktree = openPullHead(pull.number, sha);

  try {
    const paths = changedFiles(worktree.dir);

    if (needsMeasure(pull, paths) && held('pull-bench')) {
      log(`#${pull.number}: the micro-evals bench is busy; reviewing it on a later tick`);

      return false;
    }

    setReview(sha, 'pending', 'Reviewing');

    const diff = run('git', ['diff', 'origin/main...HEAD'], { cwd: worktree.dir }).out.slice(0, MAX_DIFF);
    const copy = copyReport(worktree.dir);
    const onMain = run('git', ['merge', '-q', '--no-edit', 'origin/main'], { cwd: worktree.dir, allowFail: true }).ok;

    if (!onMain) run('git', ['merge', '--abort'], { cwd: worktree.dir, allowFail: true });

    const where = onMain
      ? 'The worktree is the pull request merged onto current main, so judge it as it would land.'
      : 'It conflicts with current main, so the worktree is its own head; the rebase lane will bring it up to date.';
    const counted = `Its user-facing strings (\`tools/copy-diff.mjs\`):\n\n${fenced(copy.text)}\n\n${copyReviewNote(copy)}`;
    const others = inFlight();
    const duplicates = `Other pull requests, open or merged in the last day:\n\n${inFlightText({ ...others, except: pull.number })}\n\nIf one of them makes this same change (the same strings or the same behaviour, not merely the same area), set duplicateOf to its number.`;
    const prompt = `Review pull request #${pull.number}: ${pull.title}\n\n${pull.body}\n\n${where}\n\n${counted}\n\n${duplicates}\n\nIts diff against main:\n\n${diff}`;
    const result = runAgent({ cwd: worktree.dir, name: 'review', prompt, schema: SCHEMA, hours: 2 });

    if (!result.ok) {
      setReview(sha, 'error', 'The review session failed; it will run again');
      log(`#${pull.number}: review session failed: ${String(result.error).slice(0, 500)}`);

      return;
    }

    const original = duplicateTarget({ duplicateOf: result.output.duplicateOf, pull, ...others });

    if (original) {
      closePull(pull.number, `Closing as a duplicate of #${original}, which makes the same change.`);
      log(`#${pull.number}: duplicate of #${original}; closed`);

      return;
    }

    const judged = judgedPass(result.output);
    const measured = judged ? measureOnce({ pull, paths, log, worktree, onMain }) : null;

    if (measured?.verdict === 'busy') {
      setReview(sha, 'error', measured.description);
      log(`#${pull.number}: ${measured.log}`);

      return;
    }

    const { output, verdict, state, description } = withMeasure(result.output, measured);
    const blockers = output.findings.filter((f) => f.severity === 'blocker');

    commentOnPull(pull.number, reviewComment({ ...output, verdict }, { sha, copy }));
    setReview(sha, state, description);
    log(`#${pull.number}: ${verdict}, ${blockers.length} blockers`);
  } finally {
    unlinkRuns(worktree.dir);
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
    .filter((pull) => {
      const state = pullReview(pull);

      return (state === null || state === 'error') && pull.mergeable !== 'CONFLICTING' && pullCheck(pull) !== 'failure';
    })
    .sort((a, b) => Number(pullCheck(b) === 'success') - Number(pullCheck(a) === 'success') || byRank(a, b));

  for (const pull of waiting) {
    const release = claim(`review-${pull.number}`);

    if (!release) continue;

    try {
      if (!carryOver(pull, log) && reviewPull(pull, log) === false) continue;
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
