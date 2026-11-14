import { spawnSync } from 'node:child_process';
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

const startedAt = (pid) => {
  if (process.platform === 'win32') return '';

  const env = { ...process.env, LC_ALL: 'C', TZ: 'UTC' };

  return spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env }).stdout?.trim() ?? '';
};

const ownStart = startedAt(process.pid);

function holds(dir, name) {
  const pid = Number(name.split('-')[0]);

  if (!alive(pid)) return false;

  try {
    return fs.readFileSync(path.join(dir, name), 'utf8') === startedAt(pid);
  } catch {
    return false;
  }
}

export function requestQuiet(dir = QUIET_DIR) {
  made += 1;

  const name = `${process.pid}-${made}`;
  const file = path.join(dir, name);
  const draft = path.join(dir, `.${name}`);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(draft, ownStart);
  fs.renameSync(draft, file);

  return () => fs.rmSync(file, { force: true });
}

export function quietRequested(dir = QUIET_DIR) {
  if (!fs.existsSync(dir)) return false;

  const requests = fs.readdirSync(dir).filter((name) => !name.startsWith('.'));
  const live = requests.filter((name) => {
    if (holds(dir, name)) return true;

    fs.rmSync(path.join(dir, name), { force: true });

    return false;
  });

  return live.length > 0;
}
