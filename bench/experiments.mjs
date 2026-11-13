import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendLesson, parsePlaybook } from './playbook.mjs';

export const EXPERIMENTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'experiments.md');

const HEADER = `# Harness experiments

Every change to the CAD agent's harness that the harness lane measured on the micro-evals, kept or not, one entry each. Entries are only ever appended, never rewritten, so a change isn't tried twice as it was. How a change is measured: [Benchmark](../docs/guide/bench.md).
`;

export const appendExperiment = (file, fields) => appendLesson(file, fields, { prefix: 'E', header: HEADER });

export const readExperiments = (file = EXPERIMENTS) =>
  parsePlaybook(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
