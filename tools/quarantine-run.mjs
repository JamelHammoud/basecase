import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, activeEntries, configFor, entryMatches, loadQuarantine, onPlatform, today } from './quarantine.mjs';
import { quarantineShard } from './quarantineShard.mjs';
import { runQuarantineProcess } from './quarantineProcess.mjs';

const VITEST = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const deadline = process.env.GITHUB_ACTIONS ? Date.now() + 45000 : Infinity;

function readReport(output) {
  try {
    return JSON.parse(fs.readFileSync(output, 'utf8'));
  } catch {
    return { testResults: [] };
  }
}

async function runConfig(config, files) {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bc-quarantine-')), 'results.json');
  const args = [VITEST, 'run', '--config', config, '--reporter=default', '--reporter=json'];

  const outcome = await runQuarantineProcess([...args, `--outputFile.json=${output}`, ...files], {
    cwd: ROOT,
    timeoutMs: deadline - Date.now(),
  });

  if (outcome.timedOut) console.log(`Quarantine observation budget ended for ${config}.`);

  if (outcome.error) console.log(`Quarantine observation could not start: ${outcome.error}`);

  const results = readReport(output);

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
const live = activeEntries(entries);
const active = quarantineShard(onPlatform(live), process.argv[2]);
const expired = entries.filter((entry) => !live.includes(entry));

if (active.length === 0) {
  console.log('No quarantined tests.');
  process.exit(0);
}

const byConfig = Map.groupBy(active, (entry) => configFor(entry.file));
const results = [];

for (const [config, group] of byConfig) {
  results.push(...(await runConfig(config, [...new Set(group.map((entry) => entry.file))])));
}

console.log(`\nQuarantined tests on ${today()}:`);

if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### Quarantined tests\n\n');

for (const entry of active) report(entry, verdict(entry, results));

for (const entry of expired) console.log(`expired     ${entry.file} > ${entry.test || 'whole file'} (#${entry.issue})`);
