import fs from 'node:fs';
import path from 'node:path';
import { codePatterns } from './codePatterns.mjs';
import { npmAudit, npmOutdated } from './npmChecks.mjs';
import { pythonAudit } from './python.mjs';
import { countBySeverity, toMarkdown } from './report.mjs';
import { root } from './run.mjs';
import { secretsScan } from './secrets.mjs';
import { electronToolchain, nodeToolchain } from './toolchain.mjs';

const CHECKS = {
  npm: npmAudit,
  node: nodeToolchain,
  electron: electronToolchain,
  python: pythonAudit,
  secrets: secretsScan,
  code: codePatterns,
  outdated: npmOutdated,
};

const args = process.argv.slice(2);
const onlyArg = args.find((arg) => arg.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).split(',') : Object.keys(CHECKS);
const unknown = only.filter((name) => !CHECKS[name]);

if (unknown.length > 0) {
  console.error(`Unknown check: ${unknown.join(', ')}. Checks: ${Object.keys(CHECKS).join(', ')}`);
  process.exit(2);
}

const sections = [];

for (const name of only) {
  process.stderr.write(`Running ${name}…\n`);
  sections.push(await CHECKS[name]());
}

const date = new Date().toLocaleDateString('en-CA');
const outDir = path.join(root, 'scratch', 'security');
const markdown = toMarkdown(sections, date);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${date}.md`), markdown);
fs.writeFileSync(path.join(outDir, `${date}.json`), JSON.stringify(sections, null, 2));

const counts = countBySeverity(sections);
const failed = sections.filter((section) => section.error);

console.log(args.includes('--json') ? JSON.stringify(sections, null, 2) : markdown);
console.error(`Report: scratch/security/${date}.md`);

if (counts.critical + counts.high > 0 || failed.length > 0) process.exit(1);
