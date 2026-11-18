import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { findOnPath } from '../../electron/executables.mjs';

export const root = fileURLToPath(new URL('../../', import.meta.url));

const dependencies = fs.realpathSync(path.join(root, 'node_modules'));
const runner = path.join(dependencies, 'vitest/vitest.mjs');
const npmCandidates = [
  path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
];
const configs = [
  'vitest.config.ts',
  'vitest.e2e.config.ts',
  'vitest.app.config.ts',
  'vitest.perf.config.ts',
  'vitest.scratch.config.ts',
  'verify/vitest.config.ts',
  'verify/vitest.app.config.ts',
];

export function workspacePair() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-cache-'));
  const shared = path.join(base, 'node_modules');

  fs.mkdirSync(shared);

  for (const entry of fs
    .readdirSync(dependencies, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))) {
    const source = path.join(dependencies, entry.name);
    const target = path.join(shared, entry.name);

    if (fs.statSync(source).isDirectory()) {
      fs.symlinkSync(source, target, 'junction');

      continue;
    }

    fs.copyFileSync(source, target);
  }

  write(shared, '.package-lock.json', '{"lockfileVersion":3,"packages":{}}');

  const children = new Set();
  const dirs = ['left', 'right'].map((name) => path.join(base, name));

  for (const dir of dirs) {
    execFileSync('git', ['worktree', 'add', '--detach', '--no-checkout', dir, 'HEAD'], { cwd: root, stdio: 'pipe' });
    fs.symlinkSync(shared, path.join(dir, 'node_modules'), 'junction');

    for (const file of [
      ...configs,
      'tools/testing/vitestCache.mjs',
      'tools/check-changed.mjs',
      'tools/quarantine.mjs',
      'tools/quarantine-setup.mjs',
    ]) {
      write(dir, file, fs.readFileSync(path.join(root, file), 'utf8'));
    }

    write(dir, 'tools/quarantine.json', '[]');
    write(
      dir,
      'package.json',
      JSON.stringify({ type: 'module', scripts: { 'check:changed': 'node tools/check-changed.mjs' } }),
    );
    write(dir, 'package-lock.json', '{"lockfileVersion":3}');
    write(dir, 'eslint.config.mjs', 'export default [{files:["**/*.mjs"]}];\n');
    write(dir, '.prettierrc.json', JSON.stringify({ singleQuote: true }));
  }

  return {
    dirs,
    start: (dir, args, options) => start(children, dir, args, options),
    dispose(dir) {
      execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: root, stdio: 'pipe' });
    },
    async close() {
      for (const child of children) terminate(child);

      await Promise.all([...children].map((child) => new Promise((resolve) => child.once('close', resolve))));

      for (const dir of dirs.filter((dir) => fs.existsSync(path.join(dir, '.git')))) {
        execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: root, stdio: 'pipe' });
      }

      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}

function terminate(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform === 'win32') {
    execFileSync(findOnPath('taskkill'), ['/pid', String(child.pid), '/t', '/f'], { stdio: 'pipe' });

    return;
  }

  process.kill(-child.pid, 'SIGTERM');
}

export function write(dir, file, source) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), source);
}

function start(children, dir, args, options = {}) {
  const started = performance.now();
  const command = options.npm ? process.env.npm_execpath || npmCandidates.find((file) => fs.existsSync(file)) : runner;
  const child = spawn(process.execPath, [command, ...args], {
    cwd: dir,
    env: { ...process.env, DEBUG: 'vitest:cache:fs', ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let output = '';
  let preparationMs = null;
  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });
  const watcher = options.env?.CACHE_RELEASE
    ? fs.watch(dir, () => {
        if (fs.existsSync(path.join(dir, 'ready'))) readyResolve();
      })
    : null;
  const collect = (chunk) => {
    output += chunk.toString();

    if (preparationMs === null && output.includes('RUN  v')) preparationMs = performance.now() - started;
  };

  children.add(child);
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      children.delete(child);
      watcher?.close();
      readyResolve();
      resolve({ code, output, preparationMs, elapsedMs: performance.now() - started });
    });
  });

  return { done, ready, child };
}

export async function fixture(dir, value, options = {}) {
  write(
    dir,
    'tools/value.mjs',
    await format(`export default ${JSON.stringify(value)};`, { parser: 'babel', singleQuote: true }),
  );
  write(dir, 'tools/late.mjs', `export default ${JSON.stringify(value)};\n`);
  write(dir, 'tools/areas/one.ts', 'export default 1;\n');
  write(
    dir,
    'tools/discovery.ts',
    "export default import.meta.glob('./areas/*.ts', { eager: true, import: 'default' });\n",
  );
  write(
    dir,
    'tools/cacheFixture.test.mjs',
    await format(
      `import { expect, it } from 'vitest';
import value from './value.mjs';
import areas from './discovery.ts';
import { readFileSync, watch, writeFileSync } from 'node:fs';
it('uses workspace source and discovery', async () => {
  expect(value).toBe(${JSON.stringify(options.expected ?? value)});
  expect(Object.keys(areas).sort()).toEqual(${JSON.stringify(options.areas ?? ['./areas/one.ts'])});
  if (process.env.CACHE_RELEASE) writeFileSync('ready', 'ready');
  if (process.env.CACHE_RELEASE) await new Promise((resolve) => {
    const watcher = watch('.', () => {
      try { readFileSync(process.env.CACHE_RELEASE); watcher.close(); resolve(); } catch {}
    });
  });
  expect((await import('./late.mjs')).default).toBe(value);
});
`,
      { parser: 'babel', singleQuote: true },
    ),
  );
}

export function cacheFiles(dir) {
  const base = path.join(dir, 'scratch/vitest');

  if (!fs.existsSync(base)) return [];

  return fs
    .readdirSync(base, { recursive: true })
    .map((file) => path.join(base, file))
    .filter((file) => fs.statSync(file).isFile());
}
