import fs from 'node:fs';
import path from 'node:path';
import { creditProblems } from '../credit.mjs';
import { createPull, repo } from './github.mjs';
import { CODE_ROOT } from './paths.mjs';
import { run } from './sh.mjs';

export const KINDS = {
  feature: { prefix: 'Feature', template: 'feature' },
  integration: { prefix: 'Integration', template: 'feature' },
  fix: { prefix: 'Fix', template: 'fix' },
  repair: { prefix: 'Repair', template: 'repair' },
  refine: { prefix: 'Refine', template: 'refine' },
  lesson: { prefix: 'Lesson', template: 'lesson' },
  loop: { prefix: 'Loop', template: 'loop' },
  update: { prefix: 'Update', template: 'loop' },
};

const NONE = '_None._';

const screenshotLines = (paths, branch) =>
  paths.length === 0
    ? NONE
    : paths.map((file) => `![${path.basename(file)}](https://github.com/${repo()}/raw/${branch}/${file})`).join('\n\n');

export const pullTitle = (change) => `${KINDS[change.kind].prefix}: ${change.title}`;

export function pullBody(change, { branch, extra = {} }) {
  const template = fs.readFileSync(
    path.join(CODE_ROOT, '.github', 'PULL_REQUEST_TEMPLATE', `${KINDS[change.kind].template}.md`),
    'utf8',
  );
  const values = {
    summary: change.summary,
    why: change.why,
    cause: change.cause || NONE,
    checked: change.checked,
    changelog: change.changelog || NONE,
    screenshots: screenshotLines(change.screenshots ?? [], branch),
    ...extra,
  };

  return template
    .replace(/<!--[\s\S]*?-->\n*/g, '')
    .replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? NONE)
    .trim();
}

const git = (args, dir, opts = {}) => run('git', args, { cwd: dir, ...opts });

const hasWork = (dir) =>
  git(['status', '--porcelain'], dir).out !== '' ||
  Number(git(['rev-list', '--count', 'origin/main..HEAD'], dir).out) > 0;

export function publish(change, { dir, branch, extra }) {
  if (!change.changed || !hasWork(dir)) return null;

  const message = change.commitMessage || pullTitle(change);
  const problems = creditProblems(message);

  if (problems.length > 0) throw new Error(`Commit message credits a model or tool: ${problems.join('; ')}`);

  git(['add', '-A'], dir);

  if (git(['status', '--porcelain'], dir).out !== '') git(['commit', '-q', '-F', '-'], dir, { input: message });

  run('node', [path.join(CODE_ROOT, 'tools', 'check-credit.mjs'), 'origin/main..HEAD'], { cwd: dir });
  git(['push', '-q', '-u', 'origin', branch], dir);

  const title = pullTitle(change);

  return createPull({ branch, title, body: pullBody(change, { branch, extra }), label: `loop:${change.kind}` });
}
