import fs from 'node:fs';
import path from 'node:path';
import { LOOP_DIR } from './paths.mjs';
import { fingerprint } from './sessionJournal.mjs';

const directory = () => path.join(LOOP_DIR, 'state', 'deliveries');
const fileFor = (branch) => path.join(directory(), `${fingerprint(branch)}.json`);

export function saveDelivery(entry) {
  fs.mkdirSync(directory(), { recursive: true });

  const file = fileFor(entry.branch);
  const temporary = `${file}.${process.pid}.tmp`;

  fs.writeFileSync(temporary, JSON.stringify(entry));
  fs.renameSync(temporary, file);

  return entry;
}

export const completeDelivery = (branch) => fs.rmSync(fileFor(branch), { force: true });

export function pendingDeliveries() {
  if (!fs.existsSync(directory())) return [];

  return fs
    .readdirSync(directory())
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => {
      try {
        return [JSON.parse(fs.readFileSync(path.join(directory(), name), 'utf8'))];
      } catch {
        return [];
      }
    });
}

export const hasPendingDelivery = (branch) => branch && fs.existsSync(fileFor(branch));
export const hasPendingWorktree = (dir) => pendingDeliveries().some((entry) => entry.dir === dir);
export const pendingSteps = () =>
  new Set(
    pendingDeliveries().flatMap((entry) => [...entry.body.matchAll(/Closes #(\d+)/g)].map((match) => Number(match[1]))),
  );
