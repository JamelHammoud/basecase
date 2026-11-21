import { BANNED_COPY } from '../verify/rehearsal/uiRules.ts';
import { copyDiffOfRange, copyOccurrences } from './copy-diff.mjs';
import { judge, report } from './copy/budget.mjs';

const [range] = process.argv.slice(2);

if (!range?.includes('..')) {
  console.error('Usage: PR_BODY=<pull request body> node tools/check-copy-budget.mjs <base>..<head>');
  process.exit(2);
}

const [base, head] = range.split(/\.{2,3}/);
const { added, removed } = copyOccurrences(copyDiffOfRange({ base, head }));
const verdict = judge({ added, removed, body: process.env.PR_BODY ?? '', banned: BANNED_COPY });

console.log(report(verdict, removed));

process.exit(verdict.ok ? 0 : 1);
