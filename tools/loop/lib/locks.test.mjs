import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAlive, lockHolder } from './locks.mjs';

describe('lockHolder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-locks-'));

  it('reads the pid in a lock', () => {
    const file = path.join(dir, 'tidy.lock');

    fs.writeFileSync(file, String(process.pid));

    expect(lockHolder(file)).toBe(process.pid);
    expect(isAlive(lockHolder(file))).toBe(true);
  });

  it('treats a lock removed under it as not held', () => {
    expect(lockHolder(path.join(dir, 'gone.lock'))).toBe(0);
  });
});
