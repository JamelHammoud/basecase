#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const PLAYBOOK = path.resolve(here, '../docs/Lessons playbook.md');

const HEADER = `# Lessons playbook

What the bench and the micro-evals taught us about the agent, one lesson per entry. Entries are only ever appended (\`node bench/playbook.mjs add\`), never rewritten: a lesson that turns out wrong gets a new entry that supersedes it. Every entry names the runs that show it.
`;

const ENTRY = /^## (L-\d+): (.*)$/;
const FIELD = /^- (\w[\w ]*): (.*)$/;

function addField(entry, line) {
  const [, key, value] = FIELD.exec(line);
  const k = key.toLowerCase();
  const list = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  if (k === 'evidence' || k === 'tags') entry[k] = list;
  else if (k === 'supersedes') entry.supersedes = list;
  else entry[k] = value.trim();
}

export function parsePlaybook(text) {
  const entries = [];
  let current = null;

  for (const line of text.split('\n')) {
    const head = ENTRY.exec(line);

    if (head) {
      current = { id: head[1], title: head[2].trim(), evidence: [], tags: [], supersedes: [], body: [] };
      entries.push(current);
    } else if (current && FIELD.test(line) && !current.body.length) addField(current, line);
    else if (current && line.trim()) current.body.push(line);
  }

  return entries.map(({ body, ...e }) => ({ ...e, lesson: body.join('\n') }));
}

export function activeLessons(entries) {
  const superseded = new Set(entries.flatMap((e) => e.supersedes));

  return entries.filter((e) => !superseded.has(e.id));
}

export function nextId(entries) {
  const max = Math.max(0, ...entries.map((e) => Number(e.id.slice(2))));

  return `L-${String(max + 1).padStart(3, '0')}`;
}

export function formatEntry({ id, title, lesson, evidence, tags = [], supersedes = [], date }) {
  if (!title?.trim() || !lesson?.trim()) throw new Error('A lesson needs a title and a lesson.');

  if (!evidence?.length) throw new Error('A lesson needs at least one evidence run id (e.g. r9/unitree-g1).');

  return [
    `## ${id}: ${title.trim()}`,
    `- Date: ${date}`,
    `- Evidence: ${evidence.join(', ')}`,
    tags.length ? `- Tags: ${tags.join(', ')}` : '',
    supersedes.length ? `- Supersedes: ${supersedes.join(', ')}` : '',
    '',
    lesson.trim(),
    '',
  ]
    .filter((l, i, all) => l !== '' || all[i - 1] !== '')
    .join('\n');
}

export function appendLesson(file, fields) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : HEADER;
  const entries = parsePlaybook(text);
  const unknown = (fields.supersedes ?? []).filter((id) => !entries.some((e) => e.id === id));

  if (unknown.length) throw new Error(`No lesson ${unknown.join(', ')} to supersede.`);

  const id = nextId(entries);
  const entry = formatEntry({ ...fields, id, date: fields.date ?? new Date().toISOString().slice(0, 10) });

  fs.writeFileSync(file, `${text.replace(/\n*$/, '\n')}\n${entry}`);

  return id;
}

function cli([command, ...rest]) {
  const flag = (n) => (rest.includes(`--${n}`) ? rest[rest.indexOf(`--${n}`) + 1] : undefined);
  const list = (n) =>
    (flag(n) ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  const file = flag('file') ?? PLAYBOOK;

  if (command === 'add') {
    const id = appendLesson(file, {
      title: flag('title'),
      lesson: flag('lesson'),
      evidence: list('evidence'),
      tags: list('tags'),
      supersedes: list('supersedes'),
    });

    console.log(`Added ${id} to ${path.relative(process.cwd(), file)}`);

    return;
  }

  if (command === 'list') {
    const entries = parsePlaybook(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

    for (const e of rest.includes('--all') ? entries : activeLessons(entries))
      console.log(`${e.id}  ${e.title}  [${e.evidence.join(', ')}]`);

    return;
  }

  console.error(`Usage:
  node bench/playbook.mjs add --title "Build in the neutral pose" --lesson "…" --evidence r9/unitree-g1,r12/berkeley-humanoid [--tags pose] [--supersedes L-003]
  node bench/playbook.mjs list [--all]`);
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) cli(process.argv.slice(2));
