import fs from 'node:fs';
import path from 'node:path';
import { LOOP_DIR } from './paths.mjs';

const DIR = path.join(LOOP_DIR, 'state', 'cache');

const fileFor = (key) => path.join(DIR, `${key.replace(/[^a-z0-9-]+/gi, '-')}.json`);

const readFresh = (file, ttlMs) => {
  try {
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'));

    return Date.now() - entry.at < ttlMs ? entry : null;
  } catch {
    return null;
  }
};

export function cached(key, { ttlMs, refresh = false }, load) {
  const file = fileFor(key);
  const hit = refresh ? null : readFresh(file, ttlMs);

  if (hit) return hit.value;

  const value = load();
  const tmp = `${file}.${process.pid}`;

  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify({ at: Date.now(), value }));
  fs.renameSync(tmp, file);

  return value;
}
