import { spawnSync } from 'node:child_process';
import path from 'node:path';

const CODE = /\.(ts|tsx|mjs|js|cjs)$/;
const MAX_SHOWN = 20;
const FORMATTABLE = /\.(ts|tsx|mjs|js|cjs|json|css|html)$/;
const PYTHON = /\.py$/;

const readStdin = async () => {
  const chunks = [];

  for await (const chunk of process.stdin) chunks.push(chunk);

  return Buffer.concat(chunks).toString('utf8');
};

const run = (bin, args) => spawnSync(path.join('node_modules', '.bin', bin), args, { encoding: 'utf8' });

const input = JSON.parse((await readStdin()) || '{}');
const file = input.tool_input?.file_path;

const report = (count, lines, more) => {
  process.stderr.write(`${count} problems to fix before moving on:\n${lines.join('\n')}${more}\n`);
  process.exit(2);
};

const lintPython = (path) => {
  spawnSync('uvx', ['ruff', 'format', path], { encoding: 'utf8' });

  const ruff = spawnSync('uvx', ['ruff', 'check', '--fix', '--output-format', 'concise', path], { encoding: 'utf8' });
  const lines = (ruff.stdout ?? '').split('\n').filter((line) => line.includes(':'));

  return ruff.status === 0 ? [] : lines;
};

const pythonProblems = file && PYTHON.test(file) && file.startsWith(process.cwd()) ? lintPython(file) : null;

if (pythonProblems?.length) report(`Ruff: ${pythonProblems.length}`, pythonProblems.slice(0, MAX_SHOWN), '');

if (pythonProblems) process.exit(0);

if (!file || !FORMATTABLE.test(file) || !file.startsWith(process.cwd())) {
  process.exit(0);
}

run('prettier', ['--write', '--ignore-unknown', file]);

if (!CODE.test(file)) {
  process.exit(0);
}

const lint = run('eslint', ['--fix', '--max-warnings', '0', '--no-warn-ignored', '--format', 'json', file]);

if (lint.status !== 0) {
  const relative = path.relative(process.cwd(), file);
  const problems = JSON.parse(lint.stdout || '[]').flatMap((result) =>
    result.messages.map((m) => `${relative}:${m.line}:${m.column} ${m.message} (${m.ruleId})`),
  );
  const shown = problems.slice(0, MAX_SHOWN);
  const more = problems.length > MAX_SHOWN ? `\n…and ${problems.length - MAX_SHOWN} more (npx eslint ${file})` : '';

  report(`ESLint: ${problems.length}`, shown, more);
}
