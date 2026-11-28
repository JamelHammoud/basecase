import fs from 'node:fs';
import path from 'node:path';
import { isAlive, lockHolder } from './locks.mjs';
import { LOCKS, WORKTREES } from './paths.mjs';
import { sessionRecords } from './sessionJournal.mjs';

const HANDOFF_BYTES = 8000;

function handoffAt(dir) {
  let descriptor;

  try {
    descriptor = fs.openSync(path.join(dir, 'scratch', 'task-handoff.json'), 'r');

    const buffer = Buffer.alloc(HANDOFF_BYTES);
    const length = fs.readSync(descriptor, buffer, 0, buffer.length, 0);

    return buffer.toString('utf8', 0, length);
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function active(entry) {
  return (
    entry.name === 'repair' &&
    entry.state === 'running' &&
    /^repair-\d+$/.test(entry.worker) &&
    /^loop-repair-[a-z0-9-]+$/.test(entry.task) &&
    Number.isSafeInteger(entry.pid) &&
    entry.pid > 0 &&
    lockHolder(path.join(LOCKS, `${entry.worker}.lock`)) === entry.pid &&
    isAlive(entry.pid)
  );
}

export function activeRepairEvidence() {
  try {
    const latest = new Map();

    for (const entry of sessionRecords()
      .filter(active)
      .sort((a, b) => a.startedAt - b.startedAt))
      latest.set(entry.worker, entry);

    return [...latest.values()].map(({ worker, pid, task, startedAt }) => {
      const worktree = path.join(WORKTREES, task);

      return { worker, pid, startedAt, worktree, handoff: handoffAt(worktree) };
    });
  } catch {
    return { unavailable: true };
  }
}
