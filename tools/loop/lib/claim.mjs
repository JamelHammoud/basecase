import fs from 'node:fs';
import path from 'node:path';
import { LOCKS } from './paths.mjs';

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
};

const readPid = (file) => {
  try {
    return Number(fs.readFileSync(file, 'utf8'));
  } catch {
    return 0;
  }
};

function clearStale(file, stalePid) {
  const aside = `${file}.${process.pid}.stale`;

  try {
    fs.renameSync(file, aside);
  } catch {
    return;
  }

  if (readPid(aside) !== stalePid) {
    try {
      fs.linkSync(aside, file);
    } catch {
      fs.rmSync(aside, { force: true });

      return;
    }
  }

  fs.rmSync(aside, { force: true });
}

export const held = (key) => {
  const pid = readPid(path.join(LOCKS, `${key}.claim`));

  return pid > 0 && isAlive(pid);
};

export function claim(key) {
  fs.mkdirSync(LOCKS, { recursive: true });

  const file = path.join(LOCKS, `${key}.claim`);
  const holder = readPid(file);

  if (holder && isAlive(holder)) return null;

  if (holder) clearStale(file, holder);

  try {
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
  } catch {
    return null;
  }

  return () => {
    if (readPid(file) === process.pid) fs.rmSync(file, { force: true });
  };
}
