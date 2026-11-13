import { spawnSync } from 'node:child_process';
import { BANNED_COPY } from '../verify/rehearsal/uiRules.ts';
import { diffStrings, isScanned, judge, report } from './copy/budget.mjs';
import { extractStrings } from './copy/extract.mjs';

const [range] = process.argv.slice(2);

if (!range?.includes('..')) {
  console.error('Usage: PR_BODY=<pull request body> node tools/check-copy-budget.mjs <base>..<head>');
  process.exit(2);
}

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  if (result.status === 0) return result.stdout;

  if (allowFailure) return '';

  console.error(`git ${args.join(' ')} failed: ${result.stderr}`);
  process.exit(2);
}

const [base, head] = range.split(/\.{2,3}/);
const fork = git(['merge-base', base, head]).trim();

function changedFiles() {
  return git(['diff', '--name-status', '-M', fork, head])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, first, second] = line.split('\t');

      return { status: status[0], before: first, after: second ?? first };
    })
    .filter(({ before, after }) => isScanned(before) || isScanned(after));
}

const stringsAt = (rev, file, present) =>
  present && isScanned(file)
    ? extractStrings(git(['show', `${rev}:${file}`], { allowFailure: true }), file).map((item) => ({ ...item, file }))
    : [];

const added = [];
const removed = [];

for (const { status, before, after } of changedFiles()) {
  const old = stringsAt(fork, before, status !== 'A');
  const now = stringsAt(head, after, status !== 'D');
  const diff = diffStrings(old, now);

  added.push(...diff.added);
  removed.push(...diff.removed);
}

const verdict = judge({ added, removed, body: process.env.PR_BODY ?? '', banned: BANNED_COPY });

console.log(report(verdict, removed));

process.exit(verdict.ok ? 0 : 1);
