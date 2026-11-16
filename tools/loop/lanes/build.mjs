import { CHANGE_SCHEMA } from '../lib/agent.mjs';
import { claim } from '../lib/claim.mjs';
import { closeIssue, commentOnIssue, editIssueLabels, hasLabel, issues, openPulls } from '../lib/github.mjs';
import { OWNER_LOGIN } from '../lib/paths.mjs';
import { buildOrder } from '../lib/dependsOn.mjs';
import { checkedRun } from '../lib/preflight.mjs';
import { publish } from '../lib/pull.mjs';
import { stepPullIndex, stepStatus } from '../lib/stepPulls.mjs';
import { recordDecline } from '../lib/stepState.mjs';
import { close, openBranch } from '../lib/worktree.mjs';
import { eligibleTask, taskKey, unavailableCapabilities } from '../lib/capabilities.mjs';
import { pendingSteps } from '../lib/deliveryState.mjs';
import { taskInputSignature } from '../lib/taskInputs.mjs';
import { clearRecovery, recoveryFor, refreshRecovery, saveRecovery } from '../lib/workRecovery.mjs';
import { inputsReady, recoverySignature } from '../lib/taskReadiness.mjs';

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
  Number(hasLabel(b, PRIORITY)) - Number(hasLabel(a, PRIORITY)) ||
  Number(hasLabel(b, 'loop:feature') || hasLabel(b, 'loop:integration')) -
    Number(hasLabel(a, 'loop:feature') || hasLabel(a, 'loop:integration')) ||
  a.createdAt.localeCompare(b.createdAt);

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
  const blocked = issues('loop:blocked');

  const openSteps = [...issues(NEXT), ...issues(BUILDING), ...blocked];
  const delivering = pendingSteps();
  const candidates = unbuilt([...queued, ...stale, ...blocked], index)
    .filter((issue) => issue.author?.login === OWNER_LOGIN)
    .filter(eligibleTask)
    .filter((issue) => !delivering.has(issue.number))
    .filter((issue) => inputsReady(issue, { now, openNumbers }));

  return buildOrder(candidates, { compare: byPriorityThenAge, openSteps });
};

function reconsideration({ missing, inputSignature, waitFor, until }) {
  if (missing.length > 0)
    return `Waiting for ${missing.join(', ')}. A builder reconsiders when those capabilities become available or the task definition changes.`;

  if (inputSignature)
    return 'A builder reconsiders when its declared source inputs, task definition or available capabilities change, or its named dependencies close.';

  const dependency = waitFor.length > 0 ? `until ${waitFor.map((number) => `#${number}`).join(', ')} close, and ` : '';
  const retry = new Date(until).toISOString().slice(0, 16).replace('T', ' ');

  return `A builder picks it up again ${dependency}after ${retry} UTC at the earliest.`;
}

function decline(step, reason, inputSignature) {
  const openNumbers = openPullNumbers();
  const waitFor = [...reason.matchAll(/#(\d+)/g)].map((m) => Number(m[1])).filter((n) => openNumbers.has(n));
  const missing = unavailableCapabilities({ body: reason });
  const entry = recordDecline(step.number, {
    now: Date.now(),
    waitFor,
    inputSignature,
    taskHead: taskKey(step),
    missing,
  });

  if (missing.length > 0 || (inputSignature && waitFor.length === 0))
    editIssueLabels(step.number, { add: ['loop:blocked'], remove: [NEXT, BUILDING] });

  commentOnIssue(
    step.number,
    `Not built this time: ${reason}\n\n${reconsideration({ missing, inputSignature, waitFor, until: entry.until })}`,
  );
}

function claimNextStep() {
  for (const step of waitingSteps()) {
    const release = claim(`step-${step.number}`);

    if (release) return { step, release };
  }

  return null;
}

function recoveryContext(step, inputSignature, recovery) {
  if (!recovery || recovery.inputSignature === recoverySignature(step, inputSignature)) return '';

  return refreshRecovery(recovery);
}

function retainFailedSession(step, inputSignature, worktree, session) {
  if (!session || !worktree) return;

  saveRecovery(step.number, {
    worktree,
    inputSignature: recoverySignature(step, inputSignature),
    session,
  });
}

function buildStep(step, { log, slot }) {
  let inputSignature;
  let worktree;
  const giveBack = (result) => {
    editIssueLabels(step.number, { add: [NEXT], remove: [BUILDING] });

    if (result?.ok) decline(step, result.output.notes, inputSignature);
  };

  try {
    editIssueLabels(step.number, { add: [BUILDING], remove: [NEXT, 'loop:blocked'] });
    inputSignature = taskInputSignature(step);

    const recovery = recoveryFor(step.number);

    worktree = recovery ?? openBranch('build', `${step.number}-${slot}-${step.title}`);

    const prompt = [
      `Build this step, issue #${step.number}: ${step.title}\n\n${step.body}`,
      recoveryContext(step, inputSignature, recovery),
    ]
      .filter(Boolean)
      .join('\n\n');
    const result = checkedRun({
      cwd: worktree.dir,
      name: 'build',
      prompt,
      schema: CHANGE_SCHEMA,
      hours: 12,
      log,
      continuation: recovery?.session,
    });

    const failedSession = result.session ?? recovery?.session;

    if (!result.ok) retainFailedSession(step, inputSignature, worktree, failedSession);

    if (result.ok) clearRecovery(step.number);

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
    retainFailedSession(step, inputSignature, worktree, error.session);
    giveBack();

    throw error;
  } finally {
    if (worktree) close(worktree);
  }
}

export default function build({ log, slot }) {
  for (const step of issues(NEXT).filter((issue) => issue.author?.login === OWNER_LOGIN && !eligibleTask(issue))) {
    editIssueLabels(step.number, { add: ['loop:blocked'], remove: [NEXT, BUILDING] });
    log(`#${step.number}: removed from execution queue, unavailable ${unavailableCapabilities(step).join(', ')}`);
  }

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
