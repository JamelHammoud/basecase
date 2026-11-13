import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, activeEntries, configFor, entryMatches, loadQuarantine, today } from './quarantine.mjs';

const VITEST = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');

function runConfig(config, files) {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bc-quarantine-')), 'results.json');
  const args = [VITEST, 'run', '--config', config, '--reporter=default', '--reporter=json'];

  spawnSync(process.execPath, [...args, `--outputFile.json=${output}`, ...files], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, BASECASE_QUARANTINE: 'only' },
  });

  const results = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : { testResults: [] };

  fs.rmSync(path.dirname(output), { recursive: true, force: true });

  return results.testResults.flatMap((fileResult) =>
    fileResult.assertionResults.map((result) => ({
      file: path.relative(ROOT, fileResult.name).split(path.sep).join('/'),
      name: result.title,
      fullName: [...result.ancestorTitles, result.title].join(' > '),
      status: result.status,
    })),
  );
}

function verdict(entry, results) {
  const mine = results.filter((result) => entryMatches(entry, result) && result.status !== 'pending');

  if (mine.length === 0) return 'did not run';

  return mine.some((result) => result.status === 'failed') ? 'failed' : 'passed';
}

function report(entry, outcome) {
  const name = entry.test || 'whole file';
  const line = `${outcome.padEnd(11)} ${entry.file} > ${name} (#${entry.issue}, until ${entry.until})`;

  console.log(line);

  if (process.env.GITHUB_ACTIONS && outcome !== 'passed') {
    console.log(`::warning file=${entry.file},title=Quarantined test ${outcome}::${name} (#${entry.issue})`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${line}\n`);
}

const entries = loadQuarantine();
const active = activeEntries(entries);
const expired = entries.filter((entry) => !active.includes(entry));

if (active.length === 0) {
  console.log('No quarantined tests.');
  process.exit(0);
}

const byConfig = Map.groupBy(active, (entry) => configFor(entry.file));
const results = [...byConfig].flatMap(([config, group]) => runConfig(config, [...new Set(group.map((e) => e.file))]));

console.log(`\nQuarantined tests on ${today()}:`);

if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### Quarantined tests\n\n');

for (const entry of active) report(entry, verdict(entry, results));

for (const entry of expired) console.log(`expired     ${entry.file} > ${entry.test || 'whole file'} (#${entry.issue})`);
