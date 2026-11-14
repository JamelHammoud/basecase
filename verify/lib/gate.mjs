import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERIFY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = path.resolve(VERIFY_DIR, '..');

export const pass = (detail = '', metrics = {}) => ({ ok: true, detail, metrics });
export const fail = (detail, metrics = {}) => ({ ok: false, detail, metrics });

const TOOL_PATHS = [path.join(os.homedir(), '.cargo', 'bin'), '/opt/homebrew/opt/rustup/bin'];

export const toolEnv = (env = process.env) => ({
  ...env,
  PATH: [...TOOL_PATHS, env.PATH ?? ''].join(path.delimiter),
});

export function sh(command, args, options = {}) {
  const started = Date.now();
  const r = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...options,
    env: toolEnv(options.env),
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

const opensApp = (file) =>
  fs.existsSync(path.join(ROOT, file)) && /\bopenApp\(/.test(fs.readFileSync(path.join(ROOT, file), 'utf8'));

export const vitestConfig = (files) =>
  files.some(opensApp) ? 'verify/vitest.app.config.ts' : 'verify/vitest.config.ts';

export const vitestCheck = (name, ...files) =>
  shCheck(name, 'npx', ['vitest', 'run', '--config', vitestConfig(files), ...files]);

export const cargoCheck = (name, ...args) => shCheck(name, 'cargo', ['test', '--quiet', ...args]);
