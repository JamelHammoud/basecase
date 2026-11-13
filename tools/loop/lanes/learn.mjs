import { CHANGE_SCHEMA, runAgent } from '../lib/agent.mjs';
import { evidenceCount, evidenceText, gatherEvidence, isLoopPull } from '../lib/evidence.mjs';
import { issueComments, lineComments, mainCommits, pullsSince, windowStart } from '../lib/history.mjs';
import { OWNER_LOGIN } from '../lib/paths.mjs';
import { publish } from '../lib/pull.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 24 * 60 * 60,
  does: 'Turns mistakes seen twice, or once by Jamel, into a lint, test, guide rule or playbook entry',
};

const MAX_EVIDENCE = 300_000;

const openLessons = (pulls) =>
  pulls
    .filter((p) => p.state === 'OPEN' && isLoopPull(p, OWNER_LOGIN) && p.headRefName.startsWith('loop/learn/'))
    .map((p) => `- #${p.number} ${p.title}\n${p.body ?? ''}`);

function weekOfEvidence() {
  const since = windowStart(7);
  const pulls = pullsSince(since);
  const comments = [...issueComments(since), ...lineComments(since)];
  const evidence = gatherEvidence({ comments, pulls, commits: mainCommits(since), since, owner: OWNER_LOGIN });

  return { since, pulls, evidence };
}

const promptFor = ({ since, pulls, evidence }) =>
  [
    `What went wrong in Basecase's loop since ${since}. Find each mistake that happened at least twice, or that Jamel pointed out once, and turn it into the strongest fix that fits, following your brief.`,
    `## Lessons already open, don't repeat them\n\n${openLessons(pulls).join('\n\n') || 'None.'}`,
    evidenceText(evidence, pulls).slice(0, MAX_EVIDENCE),
  ].join('\n\n');

export default function learn({ log }) {
  const week = weekOfEvidence();

  if (evidenceCount(week.evidence) === 0) {
    log('nothing to learn from this week');

    return;
  }

  const worktree = openBranch('learn', 'lessons');

  try {
    const result = runAgent({
      cwd: worktree.dir,
      name: 'learn',
      prompt: promptFor(week),
      schema: CHANGE_SCHEMA,
      hours: 4,
    });

    if (!result.ok) {
      log(`learn session failed: ${String(result.error).slice(0, 500)}`);

      return;
    }

    const url = publish({ ...result.output, kind: 'lesson' }, worktree);

    log(url ? `opened ${url}` : `no lesson: ${result.output.notes}`);
  } finally {
    close(worktree);
  }
}
