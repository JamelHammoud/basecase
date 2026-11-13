import fs from 'node:fs';
import path from 'node:path';
import { LOCKS } from './paths.mjs';

export const isAlive = (pid) => {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
};

export const lockHolder = (file) => {
  try {
    return Number(fs.readFileSync(file, 'utf8')) || 0;
  } catch {
    return 0;
  }
};

const isHeld = (name) => {
  const pid = lockHolder(path.join(LOCKS, name));

  return pid > 0 && isAlive(pid);
};

export const heldLocks = () =>
  fs.existsSync(LOCKS)
    ? fs
        .readdirSync(LOCKS)
        .filter((name) => name.endsWith('.lock') && isHeld(name))
        .map((name) => name.slice(0, -'.lock'.length))
    : [];
