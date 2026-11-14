import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const TEST = /^[ \t]*(?:it|test|itUnless\w*|it\.\w+)\(\s*(['"`])((?:\\.|(?!\1).)+)\1/gm;
const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

export function changedLines(diff) {
  const lines = new Set();

  for (const line of diff.split('\n')) {
    const match = HUNK.exec(line);

    if (!match) continue;

    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);

    for (let n = start; n < start + Math.max(count, 1); n++) lines.add(n);
  }

  return lines;
}

export function testsAt(source, lines) {
  const lineAt = (index) => source.slice(0, index).split('\n').length;
  const starts = [...source.matchAll(TEST)].map((match) => ({ line: lineAt(match.index), name: match[2] }));
  const owning = (n) => starts.filter((start) => start.line <= n).at(-1);

  return [
    ...new Set(
      [...lines]
        .map(owning)
        .filter(Boolean)
        .map((start) => start.name),
    ),
  ];
}

export const pattern = (names) => names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

function main(base) {
  const git = (args) => execFileSync('git', args, { encoding: 'utf8' });
  const files = git(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`, '--', 'e2e/*.e2e.test.ts'])
    .split('\n')
    .filter(Boolean);
  const names = files.flatMap((file) =>
    testsAt(fs.readFileSync(file, 'utf8'), changedLines(git(['diff', '-U0', `${base}...HEAD`, '--', file]))),
  );

  console.log(JSON.stringify({ files, pattern: names.length > 0 ? pattern(names) : '' }));
}

if (fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1])) main(process.argv[2]);
