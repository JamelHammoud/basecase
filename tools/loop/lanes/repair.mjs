import { releaseAbandonedRepair } from '../lib/abandonedRepair.mjs';
import { hasPendingWorktree } from '../lib/deliveryState.mjs';
import {
  failedJobs,
  failedLog,
  lastFinishedMainCheck,
  openPulls,
  repo,
  unstickMainChecks,
  hasLabel,
} from '../lib/github.mjs';
import { publish } from '../lib/pull.mjs';
import { repairSession } from '../lib/repairSession.mjs';
import { repairPlan } from '../lib/repairPlan.mjs';
import { store } from '../lib/store.mjs';

export const schedule = {
  agent: true,
  slots: 1,
  everySeconds: 60,
  does: "Opens a repair when main's last finished Check failed",
};

const MAX_LOG = 80_000;
const HANDLED_FOR_MS = 6 * 60 * 60 * 1000;
const SESSION_MS = 30 * 60 * 1000;
const repaired = store('repair', { jobs: [] });

const beingRepaired = () =>
  openPulls().some(
    (pull) =>
      (hasLabel(pull, 'loop:repair') || pull.headRefName.startsWith('loop/repair/')) &&
      Date.now() - Date.parse(pull.createdAt) < HANDLED_FOR_MS,
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

  const saved = repaired.get(latest.databaseId);
  const reconciled = releaseAbandonedRepair(latest, saved);

  if (reconciled !== saved) repaired.save(latest.databaseId, reconciled);

  const taken = reconciled.jobs;
  const plan = repairPlan({
    run: latest,
    failed: failedJobs(latest).map(({ name }) => name),
    taken,
    repairOpen: beingRepaired,
  });

  if (plan.wait) {
    log(plan.wait);

    return;
  }

  const runUrl = `https://github.com/${repo()}/actions/runs/${latest.databaseId}`;

  repairSession({
    name: 'repair',
    slug: `main-${latest.headSha.slice(0, 7)}`,
    log,
    options: () => ({ deadlineAt: Date.now() + SESSION_MS }),
    prompt: () =>
      [
        `Check failed on main at ${latest.headSha} (${runUrl}).`,
        taken.length > 0 ? `An earlier repair already took ${taken.join(', ')}; leave those jobs to it.` : '',
        'Every failed job, with the end of its log:',
        failedLog(latest.databaseId, MAX_LOG, plan.jobs),
      ]
        .filter(Boolean)
        .join('\n\n'),
    complete: (output, worktree) => {
      let prepared = false;

      try {
        const url = publish(
          { ...output, kind: 'repair' },
          { ...worktree, extra: { failure: `[Check on main, ${latest.headSha.slice(0, 7)}](${runUrl})` } },
        );

        prepared = true;
        log(url ? `opened ${url}` : `no change: ${output.notes}`);
      } finally {
        if (prepared || hasPendingWorktree(worktree.dir))
          repaired.save(latest.databaseId, { ...reconciled, jobs: [...taken, ...plan.jobs] });
      }
    },
  });
}
