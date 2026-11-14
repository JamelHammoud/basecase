import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HERE = import.meta.dirname;
const read = (...parts) => fs.readFileSync(path.join(HERE, ...parts), 'utf8');
const STEP_MS = 10 * 60 * 1000;
const FENCED = /```(?:markdown|md)?\n([\s\S]*?)\n```/g;
const KEEP_FILE =
  'Keep its YAML front matter exactly, and every fact, link, image path, heading, numbered step, bold UI label and [[key cap]]. Add no fact or heading it does not have.';

export const KINDS = {
  changelog: { dir: 'site/content/changelog/', what: 'changelog posts', prose: true },
  blog: { dir: 'site/content/blog/', what: 'blog posts', prose: true },
  help: { dir: 'site/content/help/', what: 'help center articles', prose: false },
  pull: { what: 'pull request descriptions' },
  issue: { what: 'GitHub issues' },
};

export const kindOf = (file) =>
  Object.keys(KINDS).find((kind) => KINDS[kind].dir && file.startsWith(KINDS[kind].dir)) ?? null;

const samples = (kind) =>
  fs
    .readdirSync(path.join(HERE, 'samples', kind))
    .filter((name) => name.endsWith('.md'))
    .map((name) => read('samples', kind, name).trim());

export function lastMarkdown(output) {
  const blocks = [...String(output ?? '').matchAll(FENCED)].map((match) => match[1].trim());

  return blocks.at(-1) ?? null;
}

export const punctuationProblems = (text) =>
  [text.includes(';') && 'a semicolon', text.includes('—') && 'an em dash'].filter(Boolean);

const plainLine = (line) =>
  line
    .split(/(`[^`]*`)/)
    .map((part) =>
      part.startsWith('`')
        ? part
        : part
            .replace(/;\s+([a-z])/g, (_, letter) => `. ${letter.toUpperCase()}`)
            .replace(/;\s+/g, '. ')
            .replace(/\s*—\s*/g, ', '),
    )
    .join('');

export function plainPunctuation(text) {
  let fenced = false;

  return text
    .split('\n')
    .map((line) => {
      if (line.trimStart().startsWith('```')) fenced = !fenced;

      return fenced || line.trimStart().startsWith('```') ? line : plainLine(line);
    })
    .join('\n');
}

const frontMatter = (text) => (text.startsWith('---') ? text.slice(0, text.indexOf('\n---', 3) + 4) : '');

const MARKERS = [
  /Closes #\d+/g,
  /^copy: .*$/gm,
  /^(?:Request|Idea|Arc|Kind): .*$/gm,
  /Depends on\*{0,2}[^\n]*/g,
  /\]\(([^)\s]+)\)/g,
  /\[\[[^\]]+\]\]/g,
];

const RETITLED = new Set(['changelog', 'blog']);

const withoutTitle = (front) => front.replace(/^title:.*$/m, '');

const BOLD = /\*\*[^*\n]+\*\*/g;
const MENU_PATH = /\*\*[^*\n]+\*\*(?:\s*▸\s*\*\*[^*\n]+\*\*)+/g;

export function restoreMenuPaths(before, after) {
  return [...new Set([...before.matchAll(MENU_PATH)].map(([path]) => path))].reduce((text, path) => {
    const plain = path.replaceAll('**', '');

    return text
      .split(path)
      .map((part) => part.replaceAll(plain, path))
      .join(path);
  }, after);
}

const HEADING = /^#{1,6}\s/;

export const headingCount = (text) => {
  let fenced = false;

  return text.split('\n').filter((line) => {
    if (line.trimStart().startsWith('```')) fenced = !fenced;

    return !fenced && HEADING.test(line);
  }).length;
};

export function keepsMarkers(before, after, kind) {
  if (headingCount(before) !== headingCount(after)) return false;

  const bold = kind === 'help' ? [...before.matchAll(BOLD)].map(([found]) => found) : [];

  if (bold.some((label) => !after.includes(label))) return false;

  const strip = RETITLED.has(kind) ? withoutTitle : (front) => front;

  if (strip(frontMatter(before)) !== strip(frontMatter(after))) return false;

  return MARKERS.every((pattern) => [...before.matchAll(pattern)].every(([found]) => after.includes(found)));
}

function claude(system, prompt, run) {
  const result = run('claude', [
    '-p',
    prompt,
    '--system-prompt',
    system,
    '--output-format',
    'text',
    '--no-session-persistence',
    '--tools',
    '',
  ]);

  return result.status === 0 ? String(result.stdout) : null;
}

const spawn = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', timeout: STEP_MS, maxBuffer: 16 * 1024 * 1024 });

function humanize(text, { kind, run }) {
  const sampleText = samples(kind).join('\n\n');
  const prompt = `Here is a writing sample of the voice to match:\n\n<sample>\n${sampleText}\n</sample>\n\nHumanize these ${KINDS[kind].what.replace(/s$/, '')}. ${KEEP_FILE} Never use semicolons or em dashes. Put the final text in one \`\`\`markdown block.\n\n<text>\n${text}\n</text>`;

  return lastMarkdown(claude(read('prompts', 'humanizer.md'), prompt, run));
}

function draftAndScore(text, { kind, run }) {
  const examples = samples(kind);
  const what = KINDS[kind].what;
  const system = read('prompts', 'draft.md')
    .replaceAll('{{what}}', what)
    .replace(
      '{{format}}',
      KINDS[kind].prose
        ? read('prompts', 'avoid-markdown.md')
        : 'Keep the formatting of the text you are given: its headings, numbered steps, bold UI labels and [[key caps]].',
    )
    .replace('{{examples}}', examples.map((sample) => `<example>\n${sample}\n</example>`).join('\n'));
  const draft = lastMarkdown(
    claude(
      system,
      `Rewrite this in the voice of the examples, in Markdown, inside one \`\`\`markdown block. ${KEEP_FILE}\n\n${text}`,
      run,
    ),
  );

  if (!draft) return null;

  const stopSlop = ['SKILL.md', 'phrases.md', 'structures.md', 'examples.md']
    .map((name) => read('prompts', 'stop-slop', name))
    .join('\n\n');
  const scored = lastMarkdown(
    claude(
      stopSlop,
      `Apply this skill to the text below. Score it on the five dimensions, revise it if it scores below 35/50, then score the revision. ${KEEP_FILE} Return the scores and the final text in one \`\`\`markdown block.\n\n<text>\n${draft}\n</text>`,
      run,
    ),
  );

  return scored ?? draft;
}

export function voiceText(text, { kind, run = spawn }) {
  const full = Boolean(KINDS[kind].dir);
  const drafted = full ? draftAndScore(text, { kind, run }) : text;

  if (!drafted) return null;

  const final = humanize(drafted, { kind, run }) ?? (full ? drafted : null);

  if (!final) return null;

  const plain = restoreMenuPaths(text, plainPunctuation(final));

  return keepsMarkers(text, plain, kind) ? plain : null;
}

export const rewrite = (text, { kind, run = spawn }) => voiceText(text, { kind, run });

export function rewriteFile(file, { cwd = process.cwd(), run } = {}) {
  const kind = kindOf(file);

  if (!kind) return false;

  const full = path.join(cwd, file);
  const before = fs.readFileSync(full, 'utf8');

  if (/^type: reference$/m.test(frontMatter(before))) return false;

  const after = voiceText(before, { kind, run });

  if (!after || after.trim() === before.trim()) return false;

  fs.writeFileSync(full, `${after}\n`);

  return true;
}
