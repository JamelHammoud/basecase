import fs from 'node:fs';
import path from 'node:path';
import { BANNED_COPY } from '../../../verify/rehearsal/uiRules.ts';
import { diffStrings, judge } from '../../copy/budget.mjs';
import { changedFiles, scannedSources, stringsOf } from '../../copy-diff.mjs';
import { runAgent } from './agent.mjs';
import { ANNOUNCED, copyLines } from './pull.mjs';

const CHANGELOG = 'site/content/changelog/';
const HELP = 'site/content/help';
const TEST = /\.(test|spec|e2e)\.[cm]?[jt]sx?$/;

const at = (item) => `${item.file}:${item.line}`;

export function copyProblems({ added, removed, copy = [] }) {
  const verdict = judge({ added, removed, body: copyLines(copy), banned: BANNED_COPY });

  return [
    ...verdict.unjustified.map(
      (item) =>
        `"${item.text}" (${at(item)}) is a new string with no reason in your answer's \`copy\`. Cut it if anything on screen already says it (§3d), else list it in \`copy\` with why the screen needs it.`,
    ),
    ...verdict.banning.map(
      (item) => `"${item.text}" (${at(item)}) uses a word §3c bans (${item.banned.join(', ')}). Rewrite it.`,
    ),
  ];
}

const addsEntry = (change) =>
  change.to.startsWith(CHANGELOG) &&
  (change.status === 'A' || (change.status === 'R' && !change.from.startsWith(CHANGELOG)));

export function changelogProblems({ kind, changes }) {
  if (!kind || ANNOUNCED.has(kind)) return [];

  return changes
    .filter(addsEntry)
    .map(
      (change) =>
        `${change.to} is a new changelog entry, and a \`${kind}\` change never gets one (telling.md): delete it and its screenshots. The release notes list every merged pull request.`,
    );
}

export function coversOf(source) {
  const lines = (/^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '').split(/\r?\n/);
  const start = lines.findIndex((line) => /^covers:\s*$/.test(line));

  if (start < 0) return [];

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => !/^\s*-\s+/.test(line));

  return (end < 0 ? rest : rest.slice(0, end)).map((line) => line.replace(/^\s*-\s+/, '').trim());
}

const coveredBy = (cover, file) => (cover.endsWith('/') ? file.startsWith(cover) : file === cover);

const isGone = (change) => change.status === 'D' || (change.status === 'R' && change.from !== change.to);

const goneLine = (article, change) =>
  change.status === 'D'
    ? `${article.path} lists ${change.from} in \`covers\`, and this change deletes it: point \`covers\` at what replaced it, and recheck the article.`
    : `${article.path} lists ${change.from} in \`covers\`, and this change renames it to ${change.to}: update \`covers\`, and recheck the article.`;

function articleProblems(article, { changes, touched }) {
  const dead = changes.filter((change) => isGone(change) && article.covers.includes(change.from));

  if (dead.length > 0) return dead.map((change) => goneLine(article, change));

  if (touched.has(article.path)) return [];

  const edited = changes
    .filter((change) => !change.to.startsWith('site/') && !TEST.test(change.to))
    .filter((change) => article.covers.some((cover) => coveredBy(cover, change.to) || coveredBy(cover, change.from)))
    .map((change) => change.to);

  return edited.length === 0
    ? []
    : [
        `${article.path} covers ${edited.join(', ')}, which this change edits, and the article is unchanged. Read it against the new code: fix every step, label and screenshot that no longer holds, and leave it as it is only if all of it still does.`,
      ];
}

export function helpProblems({ changes, articles }) {
  const touched = new Set(changes.flatMap((change) => [change.from, change.to]));

  return articles.flatMap((article) => articleProblems(article, { changes, touched }));
}

function helpArticles(cwd) {
  const dir = path.join(cwd, HELP);

  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({
      path: `${HELP}/${name}`,
      covers: coversOf(fs.readFileSync(path.join(dir, name), 'utf8')),
    }));
}

function addedAndRemoved(cwd) {
  const diffs = scannedSources({ cwd }).map(({ file, renamedFrom, before, after }) =>
    diffStrings(stringsOf(renamedFrom, before), stringsOf(file, after)),
  );

  return { added: diffs.flatMap((d) => d.added), removed: diffs.flatMap((d) => d.removed) };
}

export function preflight(cwd, { kind, copy }) {
  const { changes } = changedFiles({ cwd });

  return [
    ...copyProblems({ ...addedAndRemoved(cwd), copy }),
    ...changelogProblems({ kind, changes }),
    ...helpProblems({ changes, articles: helpArticles(cwd) }),
  ];
}

export const followUpPrompt = ({ prompt, output, problems }) =>
  [
    'You already made a change in this worktree for the task below. Before its pull request opens, the runner checked it for what review fails most often and found:',
    problems.map((problem) => `- ${problem}`).join('\n'),
    'Fix each one in this worktree, run `npm run check:changed -- <files you changed>`, and answer again in full: every field as the pull request should read, with `copy` listing every string the change still adds.',
    `Your first answer:\n\n${JSON.stringify(output, null, 2)}`,
    `The task:\n\n${prompt}`,
  ].join('\n\n');

const shouldCheck = (result) => result.ok && result.output.changed && !result.output.abandon;

export function checkedRun({ kind, log, ...session }) {
  const first = runAgent(session);

  if (!shouldCheck(first)) return first;

  const problems = preflight(session.cwd, { kind: kind ?? first.output.kind, copy: first.output.copy });

  if (problems.length === 0) return first;

  log(`preflight: ${problems.length} problem${problems.length === 1 ? '' : 's'}; asking the session to fix them`);

  const second = runAgent({
    ...session,
    prompt: followUpPrompt({ prompt: session.prompt, output: first.output, problems }),
  });

  if (!second.ok) log(`preflight follow-up failed; publishing the first answer: ${String(second.error).slice(0, 300)}`);

  return second.ok ? second : first;
}
