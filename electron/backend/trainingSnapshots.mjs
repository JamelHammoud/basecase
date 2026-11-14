import fs from 'node:fs';
import path from 'node:path';

export const RUN_ID = /^policy-[a-z0-9-]+$/;

export const isCount = (value) => Number.isSafeInteger(value) && value >= 0;

export const isSnapshotRef = (ref) => typeof ref?.run === 'string' && RUN_ID.test(ref.run) && isCount(ref.iteration);

export const snapshotFile = (jobsDir, { run, iteration }) => path.join(jobsDir, run, 'snapshots', `${iteration}.json`);

export function readJsonOrNull(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
