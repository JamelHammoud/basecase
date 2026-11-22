import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-cache-'));
  vi.stubEnv('BASECASE_LOOP_DIR', dir);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('shared cache refresh', () => {
  it('reuses fresh data, explicitly refreshes it, and releases a failed loader', async () => {
    const { cached } = await import('./cache.mjs');
    const load = vi.fn(() => 1);

    expect(cached('key', { ttlMs: 60_000 }, load)).toBe(1);
    expect(cached('key', { ttlMs: 60_000 }, load)).toBe(1);
    expect(load).toHaveBeenCalledOnce();
    expect(() =>
      cached('key', { ttlMs: 60_000, refresh: true }, () => {
        throw new Error('offline');
      }),
    ).toThrow('offline');
    expect(cached('key', { ttlMs: 60_000, refresh: true }, () => 2)).toBe(2);
    expect(cached('key', { ttlMs: 60_000 }, load)).toBe(2);
  });

  it.each([false, true])('loads once across concurrent processes, refresh=%s', async (refresh) => {
    const moduleUrl = new URL('./cache.mjs', import.meta.url).href;
    const script = `
      import fs from 'node:fs';
      import path from 'node:path';
      import { cached } from ${JSON.stringify(moduleUrl)};
      const dir = process.env.BASECASE_LOOP_DIR;
      fs.writeFileSync(path.join(dir, 'ready-' + process.pid), '');
      while (!fs.existsSync(path.join(dir, 'go'))) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      const result = cached('shared', { ttlMs: 60000, refresh: ${refresh} }, () => {
        fs.appendFileSync(path.join(dir, 'loads'), 'load\\n');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
        return { number: 42 };
      });
      process.stdout.write(JSON.stringify(result));
    `;
    const children = Array.from({ length: 5 }, () => spawn(process.execPath, ['--input-type=module', '-e', script]));
    const completions = children.map(
      (child) =>
        new Promise((resolve) => {
          let output = '';
          let error = '';

          child.stdout.on('data', (chunk) => {
            output += chunk;
          });
          child.stderr.on('data', (chunk) => {
            error += chunk;
          });
          child.on('error', (failure) => resolve({ code: -1, error: failure.message }));
          child.on('close', (code) => resolve({ code, output, error }));
        }),
    );

    try {
      await vi.waitFor(() => expect(fs.readdirSync(dir).filter((file) => file.startsWith('ready-'))).toHaveLength(5));
      fs.writeFileSync(path.join(dir, 'go'), '');

      const results = await Promise.all(completions);

      expect(results.map(({ code, error }) => ({ code, error }))).toEqual(Array(5).fill({ code: 0, error: '' }));
      expect(results.map(({ output }) => JSON.parse(output))).toEqual(Array(5).fill({ number: 42 }));
      expect(fs.readFileSync(path.join(dir, 'loads'), 'utf8')).toBe('load\n');
    } finally {
      children.forEach((child) => child.kill());
      await Promise.allSettled(completions);
    }
  });
});
