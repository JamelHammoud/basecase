import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  configFor,
  diagnosticEnvironment,
  diagnosticSelection,
  FILE_LIMIT,
  literalTestPattern,
} from './diagnosticContract.mjs';

const fullTestName = (assertion) =>
  typeof assertion.title === 'string'
    ? [...(assertion.ancestorTitles ?? []), assertion.title].join(' > ')
    : assertion.fullName;

function resultOf(file, selection) {
  if (!fs.existsSync(file)) return { selected: 0, assertions: [], cleanup: ['No JSON report was produced'] };

  if (fs.statSync(file).size > FILE_LIMIT) throw new Error('Test report exceeds 1 MiB');

  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const files = report.testResults ?? [];
  const assertions = files
    .flatMap((item) => item.assertionResults ?? [])
    .filter((item) => !['pending', 'skipped', 'todo'].includes(item.status));
  const selected = assertions.filter((item) => fullTestName(item) === selection.test).length;

  return {
    selected,
    assertions: assertions.map((item) => ({
      fullName: fullTestName(item),
      status: item.status,
      duration: item.duration,
    })),
    cleanup: files.map((item) => item.message?.slice(-2000)).filter(Boolean),
  };
}

function measure({ selection, output, index }, execute) {
  const file = path.join(output, `run-${index}.json`);
  const args = [
    path.join('node_modules', 'vitest', 'vitest.mjs'),
    'run',
    selection.file,
    '--config',
    configFor(selection.file),
    `--testNamePattern=${literalTestPattern(selection.test)}`,
    '--retry=0',
    `--maxWorkers=${selection.workers}`,
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${file}`,
  ];
  const startedAt = Date.now();
  const response = execute(process.execPath, args, {
    env: diagnosticEnvironment(process.env),
    encoding: 'utf8',
    maxBuffer: FILE_LIMIT,
    timeout: 15 * 60 * 1000,
    windowsHide: true,
  });
  const log = `${response.stdout ?? ''}\n${response.stderr ?? ''}\n${response.error?.message ?? ''}`;

  fs.writeFileSync(path.join(output, `run-${index}.log`), Buffer.from(log).subarray(-FILE_LIMIT / 4));

  try {
    const result = resultOf(file, selection);
    const passed =
      response.status === 0 &&
      !response.error &&
      result.selected === 1 &&
      result.assertions.length === 1 &&
      result.assertions[0].status === 'passed';

    return {
      index,
      startedAt,
      durationMs: Date.now() - startedAt,
      exitCode: response.status,
      ...result,
      status: passed ? 'passed' : 'failed',
    };
  } catch (error) {
    fs.writeFileSync(file, JSON.stringify({ error: error.message }));

    return {
      index,
      startedAt,
      durationMs: Date.now() - startedAt,
      selected: 0,
      status: 'failed',
      error: error.message,
    };
  }
}

export function runMeasurements({ selection: input, output, revision }, execute = spawnSync) {
  const selection = diagnosticSelection(input);

  if (selection.revision !== revision) throw new Error('Checked out revision differs from requested revision');

  fs.mkdirSync(output, { recursive: true });

  const manifest = {
    version: 1,
    selection,
    revision,
    workflowRevision: process.env.GITHUB_SHA,
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      release: os.release(),
      cpus: os.cpus().length,
      memory: os.totalmem(),
      runner: process.env.RUNNER_OS,
      image: process.env.ImageVersion,
    },
    workload: {
      config: configFor(selection.file),
      retries: 0,
      quarantine: 'off',
      workers: selection.workers,
      independentProcesses: selection.runs,
    },
    results: [],
  };

  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest));

  for (let index = 1; index <= selection.runs; index++) {
    manifest.results.push(measure({ selection, output, index }, execute));
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest));
  }

  return manifest;
}
