import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { evaluationFixture } from './evaluationFixture.mjs';
import { evaluationContext } from './evaluationContext.fixtures.mjs';
import { freezeEvaluation } from './evaluationFreeze.mjs';

let fixture;
let sourceDir;
let current;

beforeAll(async () => {
  sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluation-stop-source-'));
  fixture = await evaluationFixture(sourceDir);

  const frozen = await freezeEvaluation(
    fixture.baseline,
    {
      candidate: fixture.candidate,
      package: fixture.package,
      seeds: Array.from({ length: 16 }, (_, i) => i).join(','),
    },
    evaluationContext,
  );

  expect(frozen).toBe(0);
});
afterAll(() => {
  if (sourceDir) fs.rmSync(sourceDir, { recursive: true, force: true });
});

function startRun() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluation-stop-'));
  const output = path.join(dir, 'results');
  const stopFile = path.join(dir, 'stop');
  const child = spawn(
    process.execPath,
    [
      path.resolve('tools/cli/basecase.mjs'),
      'evaluation',
      'run',
      fixture.package,
      '--output',
      output,
      '--stop-file',
      stopFile,
    ],
    { stdio: 'ignore' },
  );
  const finished = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

  return { dir, output, stopFile, child, finished, watcher: null };
}

async function waitForCheckpoint(run) {
  const ready = new Promise((resolve) => {
    const check = () => {
      if (fs.existsSync(path.join(run.output, 'comparison.json'))) resolve();
    };

    run.watcher = fs.watch(run.dir, { recursive: true }, check);
    check();
  });

  await Promise.race([
    ready,
    run.finished.then(() => {
      throw new Error('CLI exited before interruption setup completed');
    }),
  ]);
  run.watcher.close();
}

beforeEach(async () => {
  current = startRun();
  await waitForCheckpoint(current);
});
afterEach(async () => {
  current?.watcher?.close();
  current?.child.kill();
  await current?.finished;

  if (current) fs.rmSync(current.dir, { recursive: true, force: true });
});

async function interrupt(mode) {
  const { output, stopFile, child, finished } = current;
  const before = JSON.parse(fs.readFileSync(path.join(output, 'comparison.json'), 'utf8'));

  expect(before.status).toBe('incomplete');

  if (mode === 'cancel') fs.writeFileSync(stopFile, 'stop');
  else child.kill(process.platform === 'win32' ? undefined : 'SIGKILL');

  await finished;

  const report = JSON.parse(fs.readFileSync(path.join(output, 'comparison.json'), 'utf8'));

  expect(report.status).toBe('incomplete');
  expect(report.pairs.length).toBeLessThan(16);
  expect(fs.readFileSync(path.join(output, 'report.html'), 'utf8')).toContain('incomplete');

  if (mode === 'cancel') expect(report.problem).toBe('cancelled');
}

it('cancels the actual CLI through its portable stop file and retains incomplete evidence', async () => {
  await interrupt('cancel');
});
it('keeps the actual CLI output incomplete after forced process interruption', async () => {
  await interrupt('interrupt');
});
