import { fingerprint } from './sessionJournal.mjs';
import { taskInputSignature } from './taskInputs.mjs';
import { stepEntry, stepWaiting } from './stepState.mjs';
import { recoveryFor, recoveryReady } from './workRecovery.mjs';

export const recoverySignature = (issue, inputSignature) =>
  inputSignature ?? fingerprint({ title: issue.title, body: issue.body });

export function inputsReady(issue, { now, openNumbers }) {
  const entry = stepEntry(issue.number);
  const recovery = recoveryFor(issue.number);

  if (!entry.declines && !recovery) return true;

  const inputSignature = taskInputSignature(issue);

  return (
    recoveryReady(recovery, recoverySignature(issue, inputSignature)) &&
    !stepWaiting(entry, { now, openNumbers, inputSignature })
  );
}
