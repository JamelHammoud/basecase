import { CHANGE_SCHEMA, runAgent } from '../lib/agent.mjs';
import { failedJobs, failedLog, lastFinishedMainCheck, openPulls, repo, unstickMainChecks } from '../lib/github.mjs';
import { publish } from '../lib/pull.mjs';
import { repairPlan } from '../lib/repairPlan.mjs';
import { json } from '../lib/sh.mjs';
import { store } from '../lib/store.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 1,
  everySeconds: 60,
  does: "Opens a repair when main's last finished Check failed",
};

const MAX_LOG = 80_000;
const HANDLED_FOR_MS = 6 * 60 * 60 * 1000;
const repaired = store('repair', { jobs: [] });

const repairMergedSince = (when) =>
  (json('gh', ['pr', 'list', '--state', 'merged', '--limit', '30', '--json', 'headRefName,mergedAt']) ?? []).some(
    (pull) => pull.headRefName.startsWith('loop/repair/') && pull.mergedAt > when,
  );

const beingRepaired = () =>
  openPulls().some(
    (pull) => pull.headRefName.startsWith('loop/repair/') && Date.now() - Date.parse(pull.createdAt) < HANDLED_FOR_MS,
  );

export default function repair({ log }) {
  unstickMainChecks(log);

  const latest = lastFinishedMainCheck();

  if (!latest) {
    log('no Check on main has a result yet');

    return;
  }

  if (latest.conclusion !== 'failure') {
    log('main is green');

    return;
  }

  const taken = repaired.get(latest.databaseId).jobs;
  const plan = repairPlan({
    run: latest,
    failed: failedJobs(latest).map(({ name }) => name),
    taken,
    repairMerged: () => repairMergedSince(latest.createdAt),
    repairOpen: beingRepaired,
  });

  if (plan.wait) {
    log(plan.wait);

    return;
  }

  const runUrl = `https://github.com/${repo()}/actions/runs/${latest.databaseId}`;
  const worktree = openBranch('repair', `main-${latest.headSha.slice(0, 7)}`);

  try {
    const prompt = [
      `Check failed on main at ${latest.headSha} (${runUrl}).`,
      taken.length > 0 ? `An earlier repair already took ${taken.join(', ')}; leave those jobs to it.` : '',
      'Every failed job, with the end of its log:',
      failedLog(latest.databaseId, MAX_LOG, plan.jobs),
    ]
      .filter(Boolean)
      .join('\n\n');
    const result = runAgent({ cwd: worktree.dir, name: 'repair', prompt, schema: CHANGE_SCHEMA });

    if (!result.ok) {
      log(`repair session failed: ${String(result.error).slice(0, 500)}`);

      return;
    }

    repaired.save(latest.databaseId, { jobs: [...taken, ...plan.jobs] });

    const url = publish(
      { ...result.output, kind: 'repair' },
      { ...worktree, extra: { failure: `[Check on main, ${latest.headSha.slice(0, 7)}](${runUrl})` } },
    );

    log(url ? `opened ${url}` : `no change: ${result.output.notes}`);
  } finally {
    close(worktree);
  }
}
