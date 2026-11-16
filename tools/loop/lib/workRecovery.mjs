import fs from 'node:fs';
import { store } from './store.mjs';
import { run } from './sh.mjs';

import { fetchGit } from './gitFetch.mjs';

const recoveries = store('work-recovery', {});

export const recoveryFor = (number) => {
  const entry = recoveries.get(number);

  return entry.dir && fs.existsSync(entry.dir) ? entry : null;
};

export function saveRecovery(number, { worktree, inputSignature, session, reason }) {
  const previous = recoveryFor(number);
  const attempts = previous?.inputSignature === inputSignature ? (previous.attempts ?? 0) + 1 : 0;

  return recoveries.save(number, { ...worktree, inputSignature, session, reason, attempts, at: Date.now() });
}

export const clearRecovery = (number) => recoveries.save(number, {});
export const activeRecoveries = () => recoveries.all().filter((entry) => entry.dir && fs.existsSync(entry.dir));
export const hasRecovery = (dir) => activeRecoveries().some((entry) => entry.dir === dir);
export const recoveryReady = (entry, inputSignature) =>
  !entry || entry.attempts < 1 || entry.inputSignature !== inputSignature;

export function refreshRecovery({ dir }, execute = run) {
  fetchGit(['-q', 'origin', 'main'], { cwd: dir }, execute);

  const merged = execute('git', ['merge', '--no-edit', '--autostash', 'origin/main'], {
    cwd: dir,
    allowFail: true,
  });

  return `The task inputs changed since this session stopped. The runner fetched current main and attempted to merge it into this retained worktree with autostash. Inspect git status, resolve any merge or autostash conflicts and preserve the earlier edits before continuing.\nGit merge output:\n${`${merged.out}\n${merged.err}`.slice(-6000)}`;
}
