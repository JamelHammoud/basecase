import { runAgent } from '../lib/agent.mjs';
import { claim } from '../lib/claim.mjs';
import { copyReport, copyReviewNote } from '../lib/copy.mjs';
import { fetchAll, ownPatchId, resolveSha } from '../lib/branches.mjs';
import { commentOnPull, openPulls, pullComments, pullReview, reviewState, setReview } from '../lib/github.mjs';
import { run } from '../lib/sh.mjs';
import { close, openPullHead } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 4,
  everySeconds: 60,
  does: 'Reviews each pull request whose head has no agent-review status',
};

const MAX_DIFF = 400_000;

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    summary: { type: 'string' },
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

function reviewPull(pull, log) {
  const sha = pull.headRefOid;

  setReview(sha, 'pending', 'Reviewing');

  const worktree = openPullHead(pull.number, sha);

  try {
    const diff = run('git', ['diff', 'origin/main...HEAD'], { cwd: worktree.dir }).out.slice(0, MAX_DIFF);
    const copy = copyReport(worktree.dir);
    const onMain = run('git', ['merge', '-q', '--no-edit', 'origin/main'], { cwd: worktree.dir, allowFail: true }).ok;

    if (!onMain) run('git', ['merge', '--abort'], { cwd: worktree.dir, allowFail: true });

    const where = onMain
      ? 'The worktree is the pull request merged onto current main, so judge it as it would land.'
      : 'It conflicts with current main, so the worktree is its own head; the rebase lane will bring it up to date.';
    const counted = `Its user-facing strings (\`tools/copy-diff.mjs\`):\n\n${fenced(copy.text)}\n\n${copyReviewNote(copy)}`;
    const prompt = `Review pull request #${pull.number}: ${pull.title}\n\n${pull.body}\n\n${where}\n\n${counted}\n\nIts diff against main:\n\n${diff}`;
    const result = runAgent({ cwd: worktree.dir, name: 'review', prompt, schema: SCHEMA, hours: 2 });

    if (!result.ok) {
      setReview(sha, 'error', 'The review session failed; it will run again');
      log(`#${pull.number}: review session failed: ${String(result.error).slice(0, 500)}`);

      return;
    }

    const blockers = result.output.findings.filter((f) => f.severity === 'blocker');
    const verdict = result.output.verdict === 'pass' && blockers.length === 0 ? 'pass' : 'fail';

    commentOnPull(pull.number, reviewComment({ ...result.output, verdict }, { sha, copy }));
    setReview(sha, verdict === 'pass' ? 'success' : 'failure', result.output.summary);
    log(`#${pull.number}: ${verdict}, ${blockers.length} blockers`);
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

  const waiting = openPulls().filter((pull) => {
    const state = pullReview(pull);

    return state === null || state === 'error';
  });

  for (const pull of waiting) {
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
