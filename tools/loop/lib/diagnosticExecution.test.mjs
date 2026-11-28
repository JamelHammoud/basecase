import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runMeasurements } from './diagnosticExecution.mjs';
import { FILE_LIMIT } from './diagnosticContract.mjs';

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

afterEach(() => {
  dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
  vi.unstubAllEnvs();
});

it.each(['windows', 'linux'])(
  'passes installed native tools to every %s routing measurement without credentials',
  (platform) => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'measurement-'));
    const native = {
      BASECASE_ROUTING_TOOLS: path.join(output, 'routing tools'),
      ...(platform === 'windows'
        ? { BASECASE_KICAD_CLI: path.join(output, 'KiCad', 'bin', 'kicad-cli.exe') }
        : { BASECASE_KICAD_DOCKER: '1' }),
    };
    const calls = [];

    dirs.push(output);

    for (const [name, value] of Object.entries(native)) vi.stubEnv(name, value);

    vi.stubEnv('GH_TOKEN', 'fixture-credential');
    vi.stubEnv('NODE_OPTIONS', '--require=fixture');
    vi.stubEnv('BASECASE_UNRELATED_SECRET', 'fixture-credential');
    runMeasurements(
      { selection: { ...selection, platform, file: 'e2e/boardRouting.e2e.test.ts' }, output, revision },
      (_command, _args, options) => {
        calls.push(options.env);

        return { status: 1 };
      },
    );
    expect(calls).toHaveLength(selection.runs);

    for (const environment of calls) {
      expect(environment).toMatchObject(native);
      expect(environment).not.toHaveProperty('GH_TOKEN');
      expect(environment).not.toHaveProperty('NODE_OPTIONS');
      expect(environment).not.toHaveProperty('BASECASE_UNRELATED_SECRET');
    }
  },
);

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

  const manifest = runMeasurements({ selection: { ...selection, browserTrace: true }, output, revision }, execute);

  expect(calls).toHaveLength(3);
  expect(calls[0].args).toContain('--retry=0');
  expect(calls[0].args).toContain('--testNamePattern=^gallery opens \\(one\\)$');
  expect(calls[0].args).toContain('vitest.e2e.config.ts');
  expect(calls[0].options.env.DEBUG).toBe('pw:api');
  expect(calls[0].options.env.BASECASE_DIAGNOSTIC_BROWSER_TRACE).toBe('1');
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

it.each(['stdout', 'stderr', 'both'])(
  'retains fixture state, blocked actions and process errors after %s floods',
  (stream) => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'measurement-'));
    const stdout = `${stream !== 'stderr' ? 'stdout noise\n'.repeat(30000) : ''}daemon snapshot: client_lost`;
    const stderr = `${stream !== 'stdout' ? 'action trace\n'.repeat(30000) : ''}failed action: Check Servos`;

    dirs.push(output);
    runMeasurements({ selection: { ...selection, runs: 1 }, output, revision }, () => ({
      status: 1,
      stdout,
      stderr,
      error: new Error('The test process stopped'),
    }));

    const bytes = fs.readFileSync(path.join(output, 'run-1.log'));
    const log = bytes.toString('utf8');

    expect(bytes.length).toBeLessThanOrEqual(FILE_LIMIT / 4);
    expect(log).toContain('daemon snapshot: client_lost');
    expect(log).toContain('failed action: Check Servos');
    expect(log).toContain('The test process stopped');
  },
);

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

it('leaves browser action tracing off for unit diagnostics', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'measurement-'));
  let environment;

  dirs.push(output);
  runMeasurements(
    { selection: { ...selection, file: 'src/sim/engine.test.ts', runs: 1 }, output, revision },
    (_command, _args, options) => {
      environment = options.env;

      return { status: 1, stdout: '', stderr: '' };
    },
  );
  expect(environment.DEBUG).toBeUndefined();
  expect(environment.BASECASE_DIAGNOSTIC_BROWSER_TRACE).toBeUndefined();
});

it('rejects browser action tracing for a unit selection', () => {
  expect(() =>
    runMeasurements({
      selection: { ...selection, file: 'src/sim/engine.test.ts', browserTrace: true },
      output: '.',
      revision,
    }),
  ).toThrow();
});
