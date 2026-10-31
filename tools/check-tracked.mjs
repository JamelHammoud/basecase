import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'tools/check-tracked.mjs';
const MACHINE_PATH = String.raw`(^|[[:space:]'"\x60(=:])(/Users/[^/[:space:]'"]+/|/home/[^/[:space:]'"]+/|/private/(tmp|var)/|/var/folders/|[A-Za-z]:\\Users\\)`;
const PLACEHOLDER_HOMES = new Set(['me', 'user', 'name', 'example', 'runner']);

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }

  return result.stdout.split('\n').filter(Boolean);
}

function homeName(line) {
  return /\/(?:Users|home)\/([^/\s'"]+)\//.exec(line)?.[1];
}

function isPlaceholder(line) {
  const name = homeName(line);

  return name !== undefined && PLACEHOLDER_HOMES.has(name) && !/\/private\/|\/var\/folders\/|:\\Users\\/.test(line);
}

const ignoredButTracked = git(['ls-files', '--cached', '--ignored', '--exclude-standard']);
const machinePaths = git(['grep', '--cached', '-nIE', MACHINE_PATH, '--', '.', `:!${SELF}`]).filter(
  (line) => !isPlaceholder(line),
);

if (ignoredButTracked.length > 0) {
  console.error('Tracked files that .gitignore excludes (run git rm --cached on them):');
  ignoredButTracked.forEach((file) => console.error(`  ${file}`));
}

if (machinePaths.length > 0) {
  console.error(
    'Absolute paths from someone’s machine (use a relative path, or move the file to scratch/ or internal/):',
  );
  machinePaths.forEach((line) => console.error(`  ${line.slice(0, 200)}`));
}

if (ignoredButTracked.length > 0 || machinePaths.length > 0) {
  console.error('See AGENTS.md §0g.');
  process.exit(1);
}
