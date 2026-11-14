import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export const LEASE_FILE = path.join(os.tmpdir(), 'basecase-gatekeeper.lease');

const POLL_MS = 5000;
const QUIET_WAIT_MS = 60 * 60 * 1000;
const QUIET_SHARE = 0.35;

function holderAlive(file) {
  try {
    const pid = Number(fs.readFileSync(file, 'utf8'));

    process.kill(pid, 0);

    return pid !== process.pid;
  } catch {
    return false;
  }
}

function writeLease(file) {
  try {
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' });

    return true;
  } catch {
    return false;
  }
}

function tryTake(file) {
  if (writeLease(file)) return true;

  if (holderAlive(file)) return false;

  fs.rmSync(file, { force: true });

  return writeLease(file);
}

export async function takeLease({ file = LEASE_FILE, log = () => {} } = {}) {
  let told = false;

  while (!tryTake(file)) {
    if (!told) log(`Waiting for another Gatekeeper run to finish (${file}).`);

    told = true;
    await sleep(POLL_MS);
  }

  const release = () => fs.rmSync(file, { force: true });

  process.once('exit', release);

  return release;
}

export const machineQuiet = (load = os.loadavg()[0], cores = os.availableParallelism()) => load < cores * QUIET_SHARE;

export async function waitForQuiet({ waitMs = QUIET_WAIT_MS, probe = machineQuiet, log = () => {} } = {}) {
  const deadline = Date.now() + waitMs;
  let told = false;

  while (!probe()) {
    if (Date.now() >= deadline) return { quiet: false, load: os.loadavg()[0] };

    if (!told) log(`  Machine busy (load ${os.loadavg()[0].toFixed(1)}); waiting before timed checks.`);

    told = true;
    await sleep(POLL_MS);
  }

  return { quiet: true, load: os.loadavg()[0] };
}
