import fs from 'node:fs';
import { creditProblems } from '../loop/credit.mjs';

const file = process.argv[2];

if (!file) process.exit(0);

const problems = creditProblems(fs.readFileSync(file, 'utf8'));

if (problems.length > 0) {
  console.error('This commit message credits a model or tool, which Basecase never does (AGENTS.md, Commits):');

  for (const problem of problems) console.error(`  ${problem}`);

  process.exit(1);
}
