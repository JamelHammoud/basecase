import { spawnSync } from 'node:child_process';
import { creditProblems, identityProblem } from './loop/credit.mjs';

const [range] = process.argv.slice(2);

if (!range) {
  console.error('Usage: node tools/check-credit.mjs <base>..<head>');
  process.exit(2);
}

const SEP = '\u001f';
const END = '\u001e';
const log = spawnSync('git', ['log', `--format=%H${SEP}%an${SEP}%ae${SEP}%cn${SEP}%ce${SEP}%B${END}`, range], {
  encoding: 'utf8',
});

if (log.status !== 0) {
  console.error(`git log ${range} failed: ${log.stderr}`);
  process.exit(2);
}

const commits = log.stdout
  .split(END)
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [sha, an, ae, cn, ce, body] = entry.split(SEP);

    return { sha, author: { name: an, email: ae }, committer: { name: cn, email: ce }, body };
  });

const problems = commits.flatMap(({ sha, author, committer, body }) => {
  const people = [identityProblem(author), identityProblem(committer)].filter(Boolean).map((who) => `author ${who}`);

  return [...people, ...creditProblems(body)].map((problem) => `${sha.slice(0, 7)}: ${problem}`);
});

if (problems.length > 0) {
  console.error('These commits credit a model or tool, which Basecase never does (AGENTS.md, Commits):');

  for (const problem of problems) console.error(`  ${problem}`);

  process.exit(1);
}

console.log(`${commits.length} commits checked, none credit a model or tool.`);
