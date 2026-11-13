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

export function claim(key) {
  fs.mkdirSync(LOCKS, { recursive: true });

  const file = path.join(LOCKS, `${key}.claim`);
  const holder = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0;

  if (holder && isAlive(holder)) return null;

  fs.rmSync(file, { force: true });

  try {
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
  } catch {
    return null;
  }

  return () => fs.rmSync(file, { force: true });
}
