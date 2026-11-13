import fs from 'node:fs';
import path from 'node:path';
import { LOOP_DIR } from './paths.mjs';

const DIR = path.join(LOOP_DIR, 'state', 'revise');
const fileFor = (number) => path.join(DIR, `${number}.json`);

const read = (number) => {
  try {
    return JSON.parse(fs.readFileSync(fileFor(number), 'utf8'));
  } catch {
    return {};
  }
};

export const entryFor = (number) => ({
  heads: [],
  attempts: 0,
  lastJamel: '',
  lastLook: '',
  rebuilt: false,
  ...read(number),
});

export function saveEntry(number, entry) {
  const tmp = `${fileFor(number)}.${process.pid}`;

  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(entry));
  fs.renameSync(tmp, fileFor(number));
}

export const markLooked = (number, at) => saveEntry(number, { ...entryFor(number), lastLook: at });

export const markRebuilt = (number) => saveEntry(number, { ...entryFor(number), rebuilt: true });

export const recordAttempt = (number, { head, jamelAt }) => {
  const entry = entryFor(number);

  saveEntry(number, {
    ...entry,
    heads: [...new Set([...entry.heads, head])].slice(-20),
    attempts: entry.attempts + 1,
    lastJamel: jamelAt || entry.lastJamel,
  });
};
