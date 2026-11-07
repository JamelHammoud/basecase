import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERIFY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = path.resolve(VERIFY_DIR, '..');

export const pass = (detail = '', metrics = {}) => ({ ok: true, detail, metrics });
export const fail = (detail, metrics = {}) => ({ ok: false, detail, metrics });

export function sh(command, args, options = {}) {
  const started = Date.now();
  const r = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });

  return {
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    seconds: (Date.now() - started) / 1000,
  };
}

const tail = (text, lines = 12) => text.trim().split('\n').slice(-lines).join('\n');

export function shCheck(name, command, args, options = {}) {
  return {
    name,
    run: () => {
      const r = sh(command, args, options);

      return r.ok ? pass(`${r.seconds.toFixed(1)} s`) : fail(tail(`${r.stdout}\n${r.stderr}`));
    },
  };
}

export const vitestCheck = (name, ...files) =>
  shCheck(name, 'npx', ['vitest', 'run', '--config', 'verify/vitest.config.ts', ...files]);

export const cargoCheck = (name, ...args) => shCheck(name, 'cargo', ['test', '--quiet', ...args]);
