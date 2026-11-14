import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const QUIET_DIR = process.env.BASECASE_QUIET_DIR || path.join(os.homedir(), '.basecase-gatekeeper', 'quiet');

let made = 0;

const alive = (pid) => {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
};

const holder = (name) => Number(name.split('-')[0]);

export function requestQuiet(dir = QUIET_DIR) {
  made += 1;

  const file = path.join(dir, `${process.pid}-${made}`);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, new Date().toISOString());

  return () => fs.rmSync(file, { force: true });
}

export function quietRequested(dir = QUIET_DIR) {
  if (!fs.existsSync(dir)) return false;

  const live = fs.readdirSync(dir).filter((name) => {
    if (alive(holder(name))) return true;

    fs.rmSync(path.join(dir, name), { force: true });

    return false;
  });

  return live.length > 0;
}
