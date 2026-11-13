import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { run } from './lib/sh.mjs';

const IMAGE = 'node:26.13.0-bookworm';
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SETUP_TIMEOUT = 40 * 60 * 1000;
const RUN_TIMEOUT = 30 * 60 * 1000;
const USAGE = 'node tools/loop/linux-e2e.mjs <e2e file> [--runs N] [--cpus C] [--ref <git ref>]';

function options() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      runs: { type: 'string', default: '1' },
      cpus: { type: 'string', default: '3' },
      ref: { type: 'string', default: 'origin/main' },
    },
  });
  const runs = Number(values.runs);
  const file = positionals[0]?.split(path.sep).join('/');
  const valid = file?.endsWith('.e2e.test.ts') && Number.isInteger(runs) && runs > 0 && Number(values.cpus) > 0;

  if (!valid) {
    console.error(`Usage: ${USAGE}`);
    process.exit(2);
  }

  return { file, runs, cpus: values.cpus, ref: values.ref };
}

const git = (args, opts = {}) => run('git', args, { cwd: ROOT, ...opts });
const docker = (args, opts = {}) => run('docker', args, opts);

function openWorktree(ref, state) {
  if (ref.startsWith('origin/')) git(['fetch', '-q', 'origin', ref.slice('origin/'.length)]);

  state.dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bc-linux-')));
  git(['worktree', 'add', '-q', '--detach', state.dir, ref]);
}

function startContainer(state, cpus) {
  const name = `bc-e2e-${process.pid}`;
  const env = ['ELECTRON_SKIP_BINARY_DOWNLOAD=1', 'PLAYWRIGHT_BROWSERS_PATH=/opt/pw', 'BASECASE_QUARANTINE=off'];

  state.name = name;
  docker([
    'run',
    '-d',
    '--name',
    name,
    '--platform',
    'linux/amd64',
    '--cpus',
    cpus,
    '-v',
    `${state.dir}:/repo`,
    '-v',
    '/repo/node_modules',
    '-w',
    '/repo',
    ...env.flatMap((pair) => ['-e', pair]),
    IMAGE,
    'sleep',
    'infinity',
  ]);
}

function setUp(name) {
  console.log('Installing dependencies in the container…');
  docker(['exec', name, 'npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], { timeout: SETUP_TIMEOUT });
  console.log('Installing Google Chrome in the container…');
  docker(['exec', name, 'npx', 'playwright-core', 'install', '--with-deps', 'chrome'], { timeout: SETUP_TIMEOUT });
}

function failedTests(dir, results) {
  const file = path.join(dir, results);

  if (!fs.existsSync(file)) return ['no results: the run crashed or timed out'];

  const report = JSON.parse(fs.readFileSync(file, 'utf8'));

  return report.testResults.flatMap((fileResult) => {
    const failed = fileResult.assertionResults.filter((result) => result.status === 'failed');
    const crashed = failed.length === 0 && fileResult.status === 'failed';

    return crashed ? [fileResult.message || 'the file failed outside a test'] : failed.map((r) => r.fullName);
  });
}

function runOnce({ name, dir, file }, index) {
  const results = `.e2e-run-${index}.json`;
  const args = ['vitest', 'run', '--config', 'vitest.e2e.config.ts', '--reporter=dot', '--reporter=json'];
  const outcome = docker(['exec', name, 'npx', ...args, `--outputFile.json=${results}`, file], {
    timeout: RUN_TIMEOUT,
    allowFail: true,
  });
  const failures = failedTests(dir, results);

  if (!outcome.ok && failures.length === 0) failures.push(outcome.err.slice(-500) || 'vitest exited with an error');

  return failures;
}

function cleanUp({ name, dir }) {
  if (name) docker(['rm', '-f', '-v', name], { allowFail: true });

  if (!dir) return;

  git(['worktree', 'remove', '--force', dir], { allowFail: true });
  fs.rmSync(dir, { recursive: true, force: true });
  git(['worktree', 'prune'], { allowFail: true });
}

function reproduce(setup, state) {
  openWorktree(setup.ref, state);

  if (!fs.existsSync(path.join(state.dir, setup.file))) throw new Error(`${setup.file} isn't in ${setup.ref}`);

  startContainer(state, setup.cpus);
  setUp(state.name);

  let passed = 0;

  for (let index = 1; index <= setup.runs; index++) {
    const failures = runOnce({ ...state, file: setup.file }, index);

    if (failures.length === 0) passed++;

    console.log(`Run ${index}: ${failures.length === 0 ? 'passed' : 'failed'}`);

    for (const failure of failures) console.log(`  ${failure}`);
  }

  console.log(`passed ${passed} of ${setup.runs}`);

  return passed === setup.runs;
}

const setup = options();
const state = {};

const stop = () => {
  cleanUp(state);
  process.exit(130);
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

let allPassed = false;

try {
  console.log(`${setup.file} on ${setup.ref}, ${setup.runs} run(s), ${setup.cpus} CPUs, linux/amd64`);
  allPassed = reproduce(setup, state);
} catch (error) {
  console.error(error.message);
} finally {
  cleanUp(state);
}

process.exit(allPassed ? 0 : 1);
