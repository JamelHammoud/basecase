import { runAgent } from '../lib/agent.mjs';
import { claim } from '../lib/claim.mjs';
import { commentOnPull, openPulls, reviewState, setReview } from '../lib/github.mjs';
import { run } from '../lib/sh.mjs';
import { close, openPullHead } from '../lib/worktree.mjs';

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

const reviewComment = ({ verdict, summary, findings }, sha) =>
  [
    `### Review: ${verdict === 'pass' ? 'pass' : 'changes needed'} (${sha.slice(0, 7)})`,
    summary,
    ...(findings.length > 0 ? ['', ...findings.map(findingLine)] : []),
  ].join('\n');

function reviewPull(pull, log) {
  const sha = pull.headRefOid;

  setReview(sha, 'pending', 'Reviewing');

  const worktree = openPullHead(pull.number, sha);

  try {
    const diff = run('git', ['diff', 'origin/main...HEAD'], { cwd: worktree.dir }).out.slice(0, MAX_DIFF);
    const onMain = run('git', ['merge', '-q', '--no-edit', 'origin/main'], { cwd: worktree.dir, allowFail: true }).ok;

    if (!onMain) run('git', ['merge', '--abort'], { cwd: worktree.dir, allowFail: true });

    const where = onMain
      ? 'The worktree is the pull request merged onto current main, so judge it as it would land.'
      : 'It conflicts with current main, so the worktree is its own head; the rebase lane will bring it up to date.';
    const prompt = `Review pull request #${pull.number}: ${pull.title}\n\n${pull.body}\n\n${where}\n\nIts diff against main:\n\n${diff}`;
    const result = runAgent({ cwd: worktree.dir, name: 'review', prompt, schema: SCHEMA, hours: 2 });

    if (!result.ok) {
      setReview(sha, 'error', 'The review session failed; it will run again');
      log(`#${pull.number}: review session failed: ${String(result.error).slice(0, 500)}`);

      return;
    }

    const blockers = result.output.findings.filter((f) => f.severity === 'blocker');
    const verdict = result.output.verdict === 'pass' && blockers.length === 0 ? 'pass' : 'fail';

    commentOnPull(pull.number, reviewComment({ ...result.output, verdict }, sha));
    setReview(sha, verdict === 'pass' ? 'success' : 'failure', result.output.summary);
    log(`#${pull.number}: ${verdict}, ${blockers.length} blockers`);
  } finally {
    close(worktree);
  }
}

export default function review({ log }) {
  const waiting = openPulls().filter((pull) => {
    const state = reviewState(pull.headRefOid);

    return state === null || state === 'error';
  });

  for (const pull of waiting) {
    const release = claim(`review-${pull.number}`);

    if (!release) continue;

    try {
      reviewPull(pull, log);
    } finally {
      release();
    }

    return;
  }

  if (waiting.length === 0) log('nothing to review');
}
