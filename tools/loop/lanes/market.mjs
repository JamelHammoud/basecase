import fs from 'node:fs';
import path from 'node:path';
import { CHANGE_SCHEMA, runAgent } from '../lib/agent.mjs';
import { createIssue } from '../lib/github.mjs';
import { IDEA, takenTitles, titleKey } from '../lib/ideas.mjs';
import { publish } from '../lib/pull.mjs';
import { run } from '../lib/sh.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 1,
  everySeconds: 24 * 60 * 60,
  labels: ['loop:market', 'loop:idea'],
  does: 'Researches competitors, partners and integrations into docs/market/ and files loop:idea issues for the lead',
};

const MARKET = 'docs/market/';
const ENTRY = /^docs\/market\/[a-z-]+\.md#[a-z0-9-]+$/;

const idea = {
  type: 'object',
  properties: {
    title: { type: 'string', maxLength: 80, description: 'The step, verb first, sentence case, no period' },
    kind: { type: 'string', enum: ['feature', 'integration', 'refine'] },
    entries: {
      type: 'array',
      items: { type: 'string', pattern: ENTRY.source },
      minItems: 1,
      description: 'The docs/market/ entries behind it, as path#anchor, e.g. docs/market/competitors.md#onshape',
    },
  },
  required: ['title', 'kind', 'entries'],
};

const SCHEMA = {
  ...CHANGE_SCHEMA,
  properties: { ...CHANGE_SCHEMA.properties, ideas: { type: 'array', items: idea, maxItems: 5 } },
  required: [...CHANGE_SCHEMA.required, 'ideas'],
};

export const freshIdeas = (ideas, taken, known) => {
  const seen = new Set(taken.map(titleKey));

  return ideas
    .map((candidate) => ({ ...candidate, entries: candidate.entries.filter((entry) => known.has(entry)) }))
    .filter((candidate) => {
      const key = titleKey(candidate.title);

      if (seen.has(key) || candidate.entries.length === 0) return false;

      seen.add(key);

      return true;
    });
};

const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replaceAll(' ', '-');

export const anchors = (markdown) => {
  const counts = new Map();
  let fenced = false;

  return markdown.split('\n').flatMap((line) => {
    if (line.startsWith('```')) fenced = !fenced;

    const heading = fenced ? null : /^#{1,6} (.+)$/.exec(line);

    if (!heading) return [];

    const base = slug(heading[1]);
    const count = counts.get(base) ?? 0;

    counts.set(base, count + 1);

    return [count === 0 ? base : `${base}-${count}`];
  });
};

const entriesOf = (files, read) =>
  files
    .filter((file) => file.endsWith('.md'))
    .flatMap((file) => anchors(read(file)).map((anchor) => `${MARKET}${file}#${anchor}`));

const entriesAt = (dir, rev) => {
  const listed = run('git', ['ls-tree', '--name-only', `${rev}:${MARKET}`], { cwd: dir, allowFail: true });

  if (!listed.ok) return [];

  return entriesOf(listed.out.split('\n'), (file) => run('git', ['show', `${rev}:${MARKET}${file}`], { cwd: dir }).out);
};

const entriesIn = (dir) => {
  const folder = path.join(dir, MARKET);

  return entriesOf(fs.readdirSync(folder), (file) => fs.readFileSync(path.join(folder, file), 'utf8'));
};

const knownEntries = (dir, { base, published }) =>
  new Set([...entriesAt(dir, base), ...(published ? entriesIn(dir) : [])]);

export const outsideMarket = (paths) => paths.filter((file) => !file.startsWith(MARKET) || file.includes('..'));

const nulList = (out) => out.split('\0').filter(Boolean);

const changedPaths = (dir, base) => [
  ...nulList(run('git', ['diff', '--name-only', '--no-renames', '-z', base], { cwd: dir }).out),
  ...nulList(run('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: dir }).out),
];

export const ideaBody = (candidate) =>
  [`Kind: ${candidate.kind}`, '', ...candidate.entries.map((entry) => `- ${entry}`)].join('\n');

const prompt = (taken) =>
  [
    `Today is ${new Date().toISOString().slice(0, 10)}. Research the market and update docs/market/, following your brief.`,
    `## Steps already open\n\n${taken.map((title) => `- ${title}`).join('\n') || 'None.'}`,
  ].join('\n\n');

export const SANDBOX = {
  tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'WebFetch', 'WebSearch'],
  allow: ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', `Edit(${MARKET}**)`],
};

const formatDocs = (dir, files) => {
  const present = files.filter((file) => file.endsWith('.md') && fs.existsSync(path.join(dir, file)));

  if (present.length > 0)
    run('npx', ['--no-install', 'prettier', '--write', ...present], { cwd: dir, allowFail: true });
};

export default function market({ log }) {
  const taken = takenTitles();
  const worktree = openBranch('market', 'research');
  const base = run('git', ['rev-parse', 'HEAD'], { cwd: worktree.dir }).out;

  try {
    const result = runAgent({
      cwd: worktree.dir,
      name: 'market',
      prompt: prompt(taken),
      schema: SCHEMA,
      hours: 3,
      sandbox: SANDBOX,
    });

    if (!result.ok) {
      log(`market session failed: ${String(result.error).slice(0, 500)}`);

      return;
    }

    const changed = changedPaths(worktree.dir, base);
    const stray = outsideMarket(changed);

    if (stray.length > 0) {
      log(`market session changed files outside ${MARKET}, nothing published: ${stray.slice(0, 20).join(', ')}`);

      return;
    }

    const { ideas = [], notes, ...change } = result.output;

    formatDocs(worktree.dir, changed);

    const url = publish({ ...change, kind: 'market' }, worktree);

    log(url ? `opened ${url}` : 'no doc change');

    if (notes) log(`notes: ${notes}`);

    for (const candidate of freshIdeas(ideas, taken, knownEntries(worktree.dir, { base, published: Boolean(url) }))) {
      log(`idea ${createIssue({ title: candidate.title, body: ideaBody(candidate), labels: [IDEA] })}`);
    }
  } finally {
    close(worktree);
  }
}
