import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { evaluationFixture } from './evaluationFixture.mjs';
import { evaluationContext } from './evaluationContext.fixtures.mjs';
import { freezeEvaluation } from './evaluationFreeze.mjs';

const dirs = [];
let fixture;
let sourceDir;

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

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

async function interrupt(mode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluation-stop-'));

  dirs.push(dir);

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
  let stopped = false;
  const watcher = fs.watch(dir, { recursive: true }, () => {
    if (stopped || !fs.existsSync(path.join(output, 'comparison.json'))) return;

    stopped = true;

    if (mode === 'cancel') fs.writeFileSync(stopFile, 'stop');
    else child.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
  });

  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    expect(stopped).toBe(true);

    const report = JSON.parse(fs.readFileSync(path.join(output, 'comparison.json'), 'utf8'));

    expect(report.status).toBe('incomplete');
    expect(report.pairs.length).toBeLessThan(16);
    expect(fs.readFileSync(path.join(output, 'report.html'), 'utf8')).toContain('incomplete');

    if (mode === 'cancel') expect(report.problem).toBe('cancelled');
  } finally {
    watcher.close();
    child.kill();
  }
}

it('cancels the actual CLI through its portable stop file and retains incomplete evidence', async () => {
  await interrupt('cancel');
});
it('keeps the actual CLI output incomplete after forced process interruption', async () => {
  await interrupt('interrupt');
});
