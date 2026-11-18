import { availableCapabilities, taskKey } from './capabilities.mjs';
import { taskInputSignature } from './taskInputs.mjs';
import { stepEntry, stepWaiting } from './stepState.mjs';
import { recoveryFor, recoveryReady } from './workRecovery.mjs';

export const recoverySignature = (issue, inputSignature) => inputSignature ?? taskKey(issue);

function retainedBlock(recovery, issue, openNumbers) {
  if (recovery?.outcome?.status !== 'blocked') return false;

  const sameTask = recovery.taskHead
    ? recovery.taskHead === taskKey(issue)
    : recovery.originalTask === `${issue.title}\n\n${issue.body}`;

  if (!sameTask) return false;

  const { dependencies, capabilities } = recovery.outcome;
  const available = availableCapabilities();

  return dependencies.some((number) => openNumbers.has(number)) || capabilities.some((cap) => !available.includes(cap));
}

function retainedIncomplete({ issue, entry, recovery, signature }) {
  return (
    recovery?.outcome?.status === 'incomplete' &&
    recovery.inputSignature === signature &&
    recovery.originalTask === `${issue.title}\n\n${issue.body}` &&
    !(entry.missing?.length || entry.waitFor?.length) &&
    (!entry.taskHead || entry.taskHead === taskKey(issue))
  );
}

export function inputsReady(issue, { now, openNumbers }) {
  const entry = stepEntry(issue.number);
  const recovery = recoveryFor(issue.number);

  if (!entry.declines && !recovery) return true;

  if (retainedBlock(recovery, issue, openNumbers)) return false;

  const inputSignature = taskInputSignature(issue);
  const signature = recoverySignature(issue, inputSignature);

  return (
    recoveryReady(recovery, signature) &&
    (retainedIncomplete({ issue, entry, recovery, signature }) ||
      !stepWaiting(entry, { now, openNumbers, inputSignature, taskHead: taskKey(issue) }))
  );
}
