import fs from 'node:fs';
import { store } from './store.mjs';

const recoveries = store('work-recovery', {});

export const recoveryFor = (number) => {
  const entry = recoveries.get(number);

  return entry.dir && fs.existsSync(entry.dir) ? entry : null;
};

export function saveRecovery(number, { worktree, inputSignature, session }) {
  const previous = recoveryFor(number);
  const attempts = previous?.inputSignature === inputSignature ? (previous.attempts ?? 0) + 1 : 0;

  return recoveries.save(number, { ...worktree, inputSignature, session, attempts, at: Date.now() });
}

export const clearRecovery = (number) => recoveries.save(number, {});
export const activeRecoveries = () => recoveries.all().filter((entry) => entry.dir && fs.existsSync(entry.dir));
export const hasRecovery = (dir) => activeRecoveries().some((entry) => entry.dir === dir);
export const recoveryReady = (entry, inputSignature) =>
  !entry || entry.attempts < 1 || entry.inputSignature !== inputSignature;
