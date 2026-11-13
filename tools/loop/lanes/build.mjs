import { CHANGE_SCHEMA } from '../lib/agent.mjs';
import { claim } from '../lib/claim.mjs';
import { closeIssue, commentOnIssue, editIssueLabels, hasLabel, issues, openPulls } from '../lib/github.mjs';
import { OWNER_LOGIN } from '../lib/paths.mjs';
import { checkedRun } from '../lib/preflight.mjs';
import { publish } from '../lib/pull.mjs';
import { stepPullIndex, stepStatus } from '../lib/stepPulls.mjs';
import { recordDecline, stepEntry, stepWaiting } from '../lib/stepState.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 5,
  everySeconds: 60,
  does: 'Claims the next loop:next step, loop:priority first, and ships it as a pull request',
};

const NEXT = 'loop:next';
const BUILDING = 'loop:building';
const PRIORITY = 'loop:priority';

const byPriorityThenAge = (a, b) =>
  Number(hasLabel(b, PRIORITY)) - Number(hasLabel(a, PRIORITY)) || a.createdAt.localeCompare(b.createdAt);

const openPullNumbers = () => new Set(openPulls().map((pull) => pull.number));

const ORPHAN_AFTER_MS = 30 * 60 * 1000;

function closeIfMerged(step, index) {
  if (stepStatus(index, step.number) !== 'merged') return false;

  closeIssue(step.number, 'Done: a pull request for this step has merged.');

  return true;
}

const unbuilt = (steps, index) =>
  steps.filter((step) => !closeIfMerged(step, index) && stepStatus(index, step.number) === 'none');

const waitingSteps = () => {
  const index = stepPullIndex();

  if (!index) return [];

  const now = Date.now();
  const openNumbers = openPullNumbers();
  const queued = issues(NEXT).filter((issue) => !hasLabel(issue, BUILDING));
  const stale = issues(BUILDING).filter((issue) => now - Date.parse(issue.updatedAt) > ORPHAN_AFTER_MS);

  return unbuilt([...queued, ...stale], index)
    .filter((issue) => issue.author?.login === OWNER_LOGIN)
    .filter((issue) => !stepWaiting(stepEntry(issue.number), { now, openNumbers }))
    .sort(byPriorityThenAge);
};

function decline(step, reason) {
  const openNumbers = openPullNumbers();
  const waitFor = [...reason.matchAll(/#(\d+)/g)].map((m) => Number(m[1])).filter((n) => openNumbers.has(n));
  const entry = recordDecline(step.number, { now: Date.now(), waitFor });
  const until = waitFor.length > 0 ? `until ${waitFor.map((n) => `#${n}`).join(', ')} close` : '';
  const retry = new Date(entry.until).toISOString().slice(0, 16).replace('T', ' ');

  commentOnIssue(
    step.number,
    `Not built this time: ${reason}\n\nA builder picks it up again ${until ? `${until}, and ` : ''}after ${retry} UTC at the earliest.`,
  );
}

function claimNextStep() {
  for (const step of waitingSteps()) {
    const release = claim(`step-${step.number}`);

    if (release) return { step, release };
  }

  return null;
}

function buildStep(step, { log, slot }) {
  editIssueLabels(step.number, { add: [BUILDING], remove: [NEXT] });

  const worktree = openBranch('build', `${step.number}-${slot}-${step.title}`);
  const giveBack = (result) => {
    editIssueLabels(step.number, { add: [NEXT], remove: [BUILDING] });

    if (result?.ok) decline(step, result.output.notes);
  };

  try {
    const prompt = `Build this step, issue #${step.number}: ${step.title}\n\n${step.body}`;
    const result = checkedRun({ cwd: worktree.dir, name: 'build', prompt, schema: CHANGE_SCHEMA, hours: 12, log });

    if (!result.ok || !result.output.changed) {
      giveBack(result);
      log(`#${step.number} not built: ${String(result.error ?? result.output.notes).slice(0, 500)}`);

      return;
    }

    const latest = stepPullIndex({ fresh: true });
    const taken = latest ? stepStatus(latest, step.number) : 'none';

    if (taken !== 'none') {
      log(`#${step.number}: another pull request for this step is ${taken} now; not publishing a second`);

      return;
    }

    const change = { ...result.output, links: [`Closes #${step.number}.`] };
    const onDuplicate = (open) => {
      commentOnIssue(step.number, `Already being built in #${open.number}.`);
      log(`#${step.number}: #${open.number} already has this title`);
    };
    const url = publish(change, { ...worktree, onDuplicate });

    if (url) log(`#${step.number}: opened ${url}`);
  } catch (error) {
    giveBack();

    throw error;
  } finally {
    close(worktree);
  }
}

export default function build({ log, slot }) {
  const next = claimNextStep();

  if (!next) {
    log('no step waiting');

    return;
  }

  try {
    buildStep(next.step, { log, slot });
  } finally {
    next.release();
  }
}
