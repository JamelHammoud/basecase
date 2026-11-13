import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { diffStrings, isScanned } from './copy/budget.mjs';
import { extractStrings } from './copy/extract.mjs';

export const stringsOf = (file, source) =>
  source === null || !isScanned(file) ? [] : extractStrings(source, file).map((entry) => ({ ...entry, file }));

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
    const { added, removed } = diffStrings(old, now);
    const paired = pairByKind(removed, added);

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

export function changedFiles({ cwd = process.cwd(), base = 'origin/main', head = null } = {}) {
  const fork = git(cwd, ['merge-base', base, head ?? 'HEAD']).trim();
  const changes = head ? nameStatus(cwd, [fork, head]) : [...nameStatus(cwd, [fork]), ...untracked(cwd)];

  return { fork, changes };
}

export function scannedSources({ cwd = process.cwd(), base = 'origin/main', head = null } = {}) {
  const { fork, changes } = changedFiles({ cwd, base, head });
  const after = (file) => (head ? git(cwd, ['show', `${head}:${file}`]) : readTree(cwd, file));

  return changes
    .filter(({ from, to }) => isScanned(from) || isScanned(to))
    .map(({ status, from, to }) => ({
      file: to,
      renamedFrom: from,
      before: status === 'A' ? null : git(cwd, ['show', `${fork}:${from}`], { allowFail: true }),
      after: status === 'D' ? null : after(to),
    }));
}

export const copyDiffOfRange = (range = {}) => diffCopy(scannedSources(range));

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const [base = 'origin/main', head = null] = process.argv.slice(2);

  console.log(formatCopyDiff(copyDiffOfRange({ base, head })));
}
