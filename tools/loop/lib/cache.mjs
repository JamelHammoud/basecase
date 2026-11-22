import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { LOOP_DIR } from './paths.mjs';
import { claimWithin } from './claim.mjs';

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
  const startedAt = Date.now();
  const previous = readFresh(file, ttlMs);

  if (!refresh && previous) return previous.value;

  const release = claimWithin(`cache-${path.basename(file)}`, { ms: 30_000, every: 25 });

  if (!release) throw new Error(`Cache refresh still running: ${key}`);

  try {
    const loaded = readFresh(file, ttlMs);

    if (loaded && (!refresh || (loaded.at >= startedAt && loaded.id !== previous?.id))) return loaded.value;

    const value = load();
    const tmp = `${file}.${process.pid}`;

    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ id: randomUUID(), at: Date.now(), value }));
    fs.renameSync(tmp, file);

    return value;
  } finally {
    release();
  }
}
