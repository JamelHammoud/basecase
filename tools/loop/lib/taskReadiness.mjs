import { taskKey } from './capabilities.mjs';
import { taskInputSignature } from './taskInputs.mjs';
import { stepEntry, stepWaiting } from './stepState.mjs';
import { recoveryFor, recoveryReady } from './workRecovery.mjs';

export const recoverySignature = (issue, inputSignature) => inputSignature ?? taskKey(issue);

export function inputsReady(issue, { now, openNumbers }) {
  const entry = stepEntry(issue.number);
  const recovery = recoveryFor(issue.number);

  if (!entry.declines && !recovery) return true;

  const inputSignature = taskInputSignature(issue);
  const retainedIncomplete =
    recovery?.outcome?.status === 'incomplete' &&
    recovery.inputSignature === recoverySignature(issue, inputSignature) &&
    recovery.originalTask === `${issue.title}\n\n${issue.body}` &&
    !(entry.missing?.length || entry.waitFor?.length) &&
    (!entry.taskHead || entry.taskHead === taskKey(issue));

  return (
    recoveryReady(recovery, recoverySignature(issue, inputSignature)) &&
    (retainedIncomplete || !stepWaiting(entry, { now, openNumbers, inputSignature, taskHead: taskKey(issue) }))
  );
}
