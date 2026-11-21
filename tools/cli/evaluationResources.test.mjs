import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { expect, it } from 'vitest';
import { evaluationFixture, invokeEvaluation } from './evaluationFixture.mjs';

function check(file, observer) {
  return new Promise((resolve, reject) => {
    const started = performance.now();

    execFile(
      process.execPath,
      ['--import', observer, path.resolve('tools/cli/basecase.mjs'), 'check', file, '--json'],
      (error, stdout, stderr) => {
        if (error && error.code !== 1) return reject(new Error(stderr));

        resolve({
          ms: performance.now() - started,
          cases: JSON.parse(stdout).cases,
          peakRss: JSON.parse(stderr).peakRss,
        });
      },
    );
  });
}

it('measures equal nominal workloads against repeated existing CLI checks and counts preparation reuse', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluation-resources-'));

  try {
    const fixture = await evaluationFixture(dir);
    const observer = path.join(dir, 'observe.mjs');

    fs.writeFileSync(
      observer,
      `import fs from 'node:fs'; process.on('exit', () => fs.writeSync(2, JSON.stringify({ peakRss: process.resourceUsage().maxRSS * 1024 })));`,
    );

    const freezeStarted = performance.now();
    const prep = await invokeEvaluation(
      'freeze',
      fixture.baseline,
      '--candidate',
      fixture.candidate,
      '--package',
      fixture.package,
      '--seeds',
      '7,3',
      '--conditions',
      'fixed',
      '--randomization',
      'nominal',
      '--json',
    );

    const freezeWallMs = performance.now() - freezeStarted;
    const runStarted = performance.now();

    expect(prep.code).toBe(0);
    expect((await invokeEvaluation('run', fixture.package, '--output', fixture.output)).code).toBe(1);

    const runWallMs = performance.now() - runStarted;
    const report = JSON.parse(fs.readFileSync(path.join(fixture.output, 'comparison.json'), 'utf8'));
    const repeated = [];

    for (const seed of [7, 3]) {
      const baseline = await check(fixture.baseline, observer);
      const candidate = await check(fixture.candidate, observer);
      const pair = report.pairs.find((value) => value.seed === seed);

      expect(baseline.cases[0].margin).toBe(pair.baseline.margin);
      expect(candidate.cases[0].margin).toBe(pair.candidate.margin);
      repeated.push({
        seed,
        baselineMs: baseline.ms,
        candidateMs: candidate.ms,
        baselinePeakRss: baseline.peakRss,
        candidatePeakRss: candidate.peakRss,
      });
    }

    const actualBytes = fs.readdirSync(fixture.output, { recursive: true }).reduce((total, name) => {
      const file = path.join(fixture.output, name);

      return total + (fs.statSync(file).isFile() ? fs.statSync(file).size : 0);
    }, 0);
    const preparation = JSON.parse(prep.stdout);

    expect(preparation.geometryPreparations).toBe(2);
    expect(report.metrics.geometryPreparations).toBe(0);
    expect(report.metrics.peakRss).toBeGreaterThan(0);
    fs.mkdirSync('scratch', { recursive: true });
    fs.writeFileSync(
      'scratch/evaluation-resources.json',
      JSON.stringify(
        { freezeWallMs, runWallMs, preparation, evaluation: report.metrics, repeated, actualBytes },
        null,
        2,
      ),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
