import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { runMeasurements } from './diagnosticExecution.mjs';

const dirs = [];
const revision = 'b'.repeat(40);
const selection = {
  revision,
  file: 'e2e/gallery.e2e.test.ts',
  test: 'gallery opens (one)',
  runs: 3,
  workers: 1,
  platform: 'windows',
};

afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

it('runs every independent measurement without retries and retains failures and teardown errors', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'measurement-'));
  const calls = [];
  const execute = (command, args, options) => {
    calls.push({ command, args, options });

    const report = {
      testResults: [
        {
          assertionResults: [{ fullName: selection.test, status: calls.length === 1 ? 'failed' : 'passed' }],
          message: 'cleanup failed',
        },
      ],
    };
    const file = args.find((arg) => arg.startsWith('--outputFile.json=')).slice('--outputFile.json='.length);

    fs.writeFileSync(file, JSON.stringify(report));

    return { status: calls.length === 1 ? 1 : 0, stdout: 'cleanup failed', stderr: '' };
  };

  dirs.push(output);

  const manifest = runMeasurements({ selection, output, revision }, execute);

  expect(calls).toHaveLength(3);
  expect(calls[0].args).toContain('--retry=0');
  expect(calls[0].args).toContain('--testNamePattern=^gallery opens \\(one\\)$');
  expect(calls[0].args).toContain('vitest.e2e.config.ts');
  expect(manifest.results.map((item) => item.status)).toEqual(['failed', 'passed', 'passed']);
  expect(manifest.results[0].cleanup).toContain('cleanup failed');
  expect(fs.readdirSync(output)).toHaveLength(7);
});

it('reports an unmatched test as a failed measurement even if Vitest exits successfully', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'measurement-'));

  dirs.push(output);

  const manifest = runMeasurements({ selection: { ...selection, runs: 1 }, output, revision }, () => ({
    status: 0,
    stdout: '',
    stderr: '',
  }));

  expect(manifest.results[0].status).toBe('failed');
  expect(manifest.results[0].selected).toBe(0);
});

it('executes an existing unit test through the real Vitest CLI and reads its exact named result', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'measurement-'));

  dirs.push(output);

  const manifest = runMeasurements({
    selection: {
      ...selection,
      runs: 1,
      file: 'tools/loop/lib/capabilities.test.mjs',
      test: 'executable work > rejects a task needing an interactive Windows host while allowing Windows CI work',
    },
    output,
    revision,
  });

  const report = fs.readFileSync(path.join(output, 'run-1.json'), 'utf8');

  expect(manifest.results[0], report).toMatchObject({ selected: 1, status: 'passed', exitCode: 0 });
});
