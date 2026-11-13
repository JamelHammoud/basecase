import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = (relative) => path.join(root, 'node_modules', relative);
const SCRIPT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TYPED = /\.(ts|tsx|mts|cts)$/;
const TESTED_ROOTS = ['src/', 'electron/', 'tools/', 'bench/', 'verify/lib/'];

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }

  return result.stdout.split('\n').filter(Boolean);
}

function changedFiles() {
  const tracked = git(['diff', '--name-only', 'HEAD']);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);

  return [...new Set([...tracked, ...untracked])];
}

function requestedFiles() {
  const args = process.argv.slice(2).map((file) => path.relative(root, path.resolve(file)).split(path.sep).join('/'));

  return args.length > 0 ? args : changedFiles();
}

function run(label, command, args) {
  console.log(`\n▸ ${label}`);

  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });

  return result.status === 0;
}

function nodeTool(label, script, args) {
  return run(label, process.execPath, [bin(script), ...args]);
}

function steps(files) {
  const scripts = files.filter((file) => SCRIPT.test(file));
  const python = files.filter((file) => file.endsWith('.py'));
  const tested = scripts.filter((file) => TESTED_ROOTS.some((prefix) => file.startsWith(prefix)));

  return [
    () => nodeTool('Prettier', 'prettier/bin/prettier.cjs', ['--check', '--ignore-unknown', ...files]),
    scripts.length > 0 &&
      (() => nodeTool('ESLint', 'eslint/bin/eslint.js', ['--max-warnings', '0', '--no-warn-ignored', ...scripts])),
    python.length > 0 && (() => run('Ruff check', 'uvx', ['ruff', 'check', ...python])),
    python.length > 0 && (() => run('Ruff format', 'uvx', ['ruff', 'format', '--check', ...python])),
    files.some((file) => file.endsWith('.md')) &&
      (() => run('Docs', process.execPath, [path.join(root, 'tools/check-docs.mjs')])),
    scripts.some((file) => TYPED.test(file)) && (() => nodeTool('Types', 'typescript/bin/tsc', ['-b'])),
    tested.length > 0 &&
      (() => nodeTool('Related tests', 'vitest/vitest.mjs', ['related', '--run', '--passWithNoTests', ...tested])),
  ].filter(Boolean);
}

const files = requestedFiles().filter((file) => existsSync(path.join(root, file)));

if (files.length === 0) {
  console.log('No changed files to check.');
  process.exit(0);
}

console.log(`Checking ${files.length} file${files.length === 1 ? '' : 's'}.`);

const failed = steps(files).filter((step) => !step()).length;

process.exit(failed > 0 ? 1 : 0);
