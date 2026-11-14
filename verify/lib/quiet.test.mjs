import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { quietRequested, requestQuiet } from './quiet.mjs';

const tempDir = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-quiet-')), 'quiet');

describe('Gatekeeper quiet requests', () => {
  it('holds while any request is open, nested ones included, and lifts when the last closes', () => {
    const dir = tempDir();

    expect(quietRequested(dir)).toBe(false);

    const outer = requestQuiet(dir);
    const inner = requestQuiet(dir);

    expect(quietRequested(dir)).toBe(true);
    inner();
    expect(quietRequested(dir)).toBe(true);
    outer();
    expect(quietRequested(dir)).toBe(false);
  });

  it('drops a request whose process is gone, so a crashed run never holds the loop', () => {
    const dir = tempDir();

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '999999999-1'), '');

    expect(quietRequested(dir)).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('drops a request whose process id now belongs to a later process', () => {
    const dir = tempDir();

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${process.pid}-1`), 'Thu Jan  1 00:00:00 1970');

    expect(quietRequested(dir)).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('skips a request still being written, so a reader never drops it half done', () => {
    const dir = tempDir();

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `.${process.pid}-1`), '');

    expect(quietRequested(dir)).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([`.${process.pid}-1`]);
  });
});
