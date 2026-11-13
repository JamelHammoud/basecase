import fs from 'node:fs';
import path from 'node:path';
import { creditProblems } from '../credit.mjs';
import { createPull, openPulls, repo } from './github.mjs';
import { landedIn, NOTHING_LANDED } from './landed.mjs';
import { sameTitle } from './titles.mjs';
import { CODE_ROOT } from './paths.mjs';
import { protectedIn, protectedList } from './protected.mjs';
import { run } from './sh.mjs';

export const KINDS = {
  feature: { prefix: 'Feature', template: 'feature' },
  integration: { prefix: 'Integration', template: 'feature' },
  fix: { prefix: 'Fix', template: 'fix' },
  repair: { prefix: 'Repair', template: 'repair' },
  refine: { prefix: 'Refine', template: 'refine' },
  lesson: { prefix: 'Lesson', template: 'lesson' },
  harness: { prefix: 'Harness', template: 'harness' },
  loop: { prefix: 'Loop', template: 'loop' },
  update: { prefix: 'Update', template: 'loop' },
  market: { prefix: 'Market', template: 'loop' },
};

const NONE = '_None._';

const oneLine = (text) => text.replace(/\s+/g, ' ').trim();

const copyLines = (copy = []) =>
  copy.length === 0 ? NONE : copy.map(({ string, why }) => `copy: "${oneLine(string)}" — ${oneLine(why)}`).join('\n');

const screenshotLines = (paths, branch) =>
  paths.length === 0
    ? NONE
    : paths.map((file) => `![${path.basename(file)}](https://github.com/${repo()}/raw/${branch}/${file})`).join('\n\n');

const shownScreenshots = (change, landed) => [
  ...new Set([...(change.screenshots ?? []).filter(landed.exists), ...landed.images]),
];

const entryLines = (entries) => (entries.length === 0 ? NONE : entries.join('\n\n'));

export const pullTitle = (change) => `${KINDS[change.kind].prefix}: ${change.title}`;

export const kindOf = (title) => Object.keys(KINDS).find((kind) => title.startsWith(`${KINDS[kind].prefix}: `)) ?? null;

const withProtected = (body, files = []) =>
  files.length === 0
    ? body
    : `${body}\n\n## Protected paths\n\n${protectedList(files)}. The reason for each is in Why; review fails one without it.`;

const ADDED_SECTIONS = { screenshots: 'Screenshots', copy: 'Copy', changelog: 'Changelog' };

const withAddedSections = (template, values) =>
  Object.entries(ADDED_SECTIONS)
    .filter(([field]) => !template.includes(`{{${field}}}`) && values[field] !== NONE)
    .reduce((text, [field, heading]) => `${text.trimEnd()}\n\n## ${heading}\n\n{{${field}}}\n`, template);

const templateFor = (change, values) =>
  withAddedSections(
    fs.readFileSync(
      path.join(CODE_ROOT, '.github', 'PULL_REQUEST_TEMPLATE', `${KINDS[change.kind].template}.md`),
      'utf8',
    ),
    values,
  );

const fieldValues = (change, branch, landed) => ({
  summary: change.summary,
  why: change.why,
  cause: change.cause || NONE,
  checked: change.checked,
  changelog: entryLines(landed.entries),
  screenshots: screenshotLines(shownScreenshots(change, landed), branch),
  copy: copyLines(change.copy),
});

export function pullBody(change, { branch, extra = {}, protectedPaths = [], landed = NOTHING_LANDED }) {
  const values = { ...fieldValues(change, branch, landed), ...extra };
  const body = templateFor(change, values)
    .replace(/<!--[\s\S]*?-->\n*/g, '')
    .replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? NONE)
    .trim();

  const links = (change.links ?? []).join(' ');

  return withProtected(links ? `${body}\n\n${links}` : body, protectedPaths);
}

export const REVISED_FIELDS = ['summary', 'why', 'checked', 'screenshots', 'copy'];

const REVISED_SECTIONS = [...REVISED_FIELDS, 'changelog'];

const TRAILING = ['## Protected paths', '## Revisions'];

const headingOf = (template, field) => {
  const at = template.indexOf(`{{${field}}}`);

  return at < 0 ? null : ([...template.slice(0, at).matchAll(/^## (.+)$/gm)].at(-1)?.[1] ?? null);
};

function withSection(body, heading, value) {
  const sections = body.split(/\n(?=## )/);
  const fresh = `## ${heading}\n\n${value}\n`;
  const at = sections.findIndex((section) => section.split('\n')[0] === `## ${heading}`);

  if (at >= 0) return sections.with(at, fresh).join('\n').trimEnd();

  if (value === NONE) return body;

  const before = sections.findIndex((section) => TRAILING.includes(section.split('\n')[0]));

  return before < 0 ? `${body.trimEnd()}\n\n${fresh}`.trimEnd() : sections.toSpliced(before, 0, fresh).join('\n');
}

export function revisedBody(body, change, { branch, landed = NOTHING_LANDED }) {
  const values = fieldValues(change, branch, landed);
  const template = templateFor(change, values);

  return REVISED_SECTIONS.reduce((text, field) => {
    const heading = headingOf(template, field) ?? ADDED_SECTIONS[field];

    return heading ? withSection(text, heading, values[field]) : text;
  }, body);
}

const git = (args, dir, opts = {}) => run('git', args, { cwd: dir, ...opts });

const hasWork = (dir) =>
  git(['status', '--porcelain'], dir).out !== '' ||
  Number(git(['rev-list', '--count', 'origin/main..HEAD'], dir).out) > 0;

export function publish(change, { dir, branch, extra, onDuplicate }) {
  if (!change.changed || !hasWork(dir)) return null;

  const duplicate = openPulls().find((pull) => sameTitle(pull.title, pullTitle(change)));

  if (duplicate) {
    onDuplicate?.(duplicate);

    return null;
  }

  const message = change.commitMessage || pullTitle(change);
  const problems = creditProblems(message);

  if (problems.length > 0) throw new Error(`Commit message credits a model or tool: ${problems.join('; ')}`);

  git(['add', '-A'], dir);

  if (git(['status', '--porcelain'], dir).out !== '') git(['commit', '-q', '-F', '-'], dir, { input: message });

  run('node', [path.join(CODE_ROOT, 'tools', 'check-credit.mjs'), 'origin/main..HEAD'], { cwd: dir });
  git(['push', '-q', '-u', 'origin', branch], dir);

  const title = pullTitle(change);
  const body = pullBody(change, {
    branch,
    extra,
    protectedPaths: protectedIn('origin/main...HEAD', dir),
    landed: landedIn('origin/main...HEAD', dir),
  });

  try {
    return createPull({ branch, title, body, label: `loop:${change.kind}` });
  } catch (error) {
    git(['push', '-q', 'origin', '--delete', branch], dir, { allowFail: true });

    throw error;
  }
}
