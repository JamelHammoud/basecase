import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runMeasurements } from './lib/diagnosticExecution.mjs';

const manifest = runMeasurements({
  selection: JSON.parse(process.env.DIAGNOSTIC),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  output: path.resolve('scratch', 'diagnostic-artifact'),
});

process.exitCode = manifest.results.every((item) => item.status === 'passed') ? 0 : 1;
