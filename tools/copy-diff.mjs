import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractCopy } from './eslint/copy-strings.mjs';

const SOURCES = [/^src\/.+\.tsx?$/, /^electron\/app-menu\.mjs$/];
const SKIPPED = [/\.d\.ts$/, /\.(test|spec|e2e)\.[cm]?[jt]sx?$/, /(^|\/)(__tests__|fixtures?)\//];

export const isCopySource = (file) =>
  SOURCES.some((pattern) => pattern.test(file)) && !SKIPPED.some((pattern) => pattern.test(file));

const stringsOf = (file, source) =>
  source === null || !isCopySource(file) ? [] : extractCopy(source, file).map((entry) => ({ ...entry, file }));

function subtract(list, other) {
  const left = new Map();

  for (const { text } of other) left.set(text, (left.get(text) ?? 0) + 1);

  return list.filter(({ text }) => {
    const remaining = left.get(text) ?? 0;

    left.set(text, remaining - 1);

    return remaining <= 0;
  });
}

function pairByKind(removed, added) {
  const unpaired = [...added];
  const changed = [];
  const gone = [];

  for (const before of removed) {
    const index = unpaired.findIndex((after) => after.kind === before.kind);

    if (index === -1) {
      gone.push(before);

      continue;
    }

    changed.push({ before, after: unpaired.splice(index, 1)[0] });
  }

  return { changed, removed: gone, added: unpaired };
}

export function diffCopy(files) {
  const result = { added: [], changed: [], removed: [] };

  for (const { file, before = null, after = null, renamedFrom = file } of files) {
    const old = stringsOf(renamedFrom, before);
    const now = stringsOf(file, after);
    const paired = pairByKind(subtract(old, now), subtract(now, old));

    result.added.push(...paired.added);
    result.changed.push(...paired.changed);
    result.removed.push(...paired.removed);
  }

  return { ...result, net: result.added.length - result.removed.length };
}

const signed = (n) => (n > 0 ? `+${n}` : String(n));

export const copySummary = ({ added, changed, removed, net }) =>
  `Copy: ${added.length} added, ${changed.length} changed, ${removed.length} removed, net ${signed(net)}`;

const at = ({ file, line }) => `${file}:${line}`;

export function formatCopyDiff(diff) {
  const lines = [
    ...diff.added.map((s) => `+ "${s.text}"  ${at(s)}`),
    ...diff.changed.map(({ before, after }) => `~ "${before.text}" → "${after.text}"  ${at(after)}`),
    ...diff.removed.map((s) => `- "${s.text}"  ${at(s)}`),
  ];

  return [...lines, ...(lines.length > 0 ? [''] : []), copySummary(diff)].join('\n');
}

function git(cwd, args, { allowFail = false } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

  if (result.status === 0) return result.stdout;

  if (allowFail) return null;

  throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
}

const nameStatus = (cwd, args) =>
  git(cwd, ['diff', '--name-status', '-M', ...args])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, first, second] = line.split('\t');

      return { status: status[0], from: first, to: second ?? first };
    });

const untracked = (cwd) =>
  git(cwd, ['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .filter(Boolean)
    .map((file) => ({ status: 'A', from: file, to: file }));

const readTree = (cwd, file) => fs.readFileSync(path.join(cwd, file), 'utf8');

export function copyDiffOfRange({ cwd = process.cwd(), base = 'origin/main', head = null } = {}) {
  const fork = git(cwd, ['merge-base', base, head ?? 'HEAD']).trim();
  const changes = head ? nameStatus(cwd, [fork, head]) : [...nameStatus(cwd, [fork]), ...untracked(cwd)];
  const after = (file) => (head ? git(cwd, ['show', `${head}:${file}`]) : readTree(cwd, file));

  return diffCopy(
    changes
      .filter(({ from, to }) => isCopySource(from) || isCopySource(to))
      .map(({ status, from, to }) => ({
        file: to,
        renamedFrom: from,
        before: status === 'A' ? null : git(cwd, ['show', `${fork}:${from}`], { allowFail: true }),
        after: status === 'D' ? null : after(to),
      })),
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const [base = 'origin/main', head = null] = process.argv.slice(2);

  console.log(formatCopyDiff(copyDiffOfRange({ base, head })));
}
