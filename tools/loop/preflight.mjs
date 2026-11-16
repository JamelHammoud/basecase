import fs from 'node:fs';
import { preflight } from './lib/preflight.mjs';

const file = process.argv[process.argv.indexOf('--answer') + 1];

if (!process.argv.includes('--answer') || !file) {
  process.stderr.write('Usage: node tools/loop/preflight.mjs --answer scratch/loop-answer.json\n');
  process.exitCode = 1;
} else {
  const answer = JSON.parse(fs.readFileSync(file, 'utf8'));
  const findings = preflight(process.cwd(), { kind: answer.kind, copy: answer.copy });

  process.stdout.write(`${JSON.stringify({ findings }, null, 2)}\n`);
  process.exitCode = findings.length ? 1 : 0;
}
