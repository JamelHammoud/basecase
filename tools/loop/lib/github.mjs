import { cached } from './cache.mjs';
import { LOOP_MARK, withMark } from './mark.mjs';
import { json, run } from './sh.mjs';

const REVIEW_CONTEXT = 'agent-review';
let slug;

export const repo = () => {
  slug ??= run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).out;

  return slug;
};

const PULL_FIELDS =
  'number,title,body,url,headRefName,headRefOid,isDraft,isCrossRepository,createdAt,mergeable,labels,updatedAt,statusCheckRollup';

export const sameTitle = (a, b) => {
  const norm = (t) =>
    t
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.\s]+$/, '')
      .trim();

  return norm(a) === norm(b);
};

export const openPulls = ({ fresh = false } = {}) =>
  cached('open-pulls', { ttlMs: 20_000, refresh: fresh }, () =>
    (json('gh', ['pr', 'list', '--state', 'open', '--limit', '100', '--json', PULL_FIELDS]) ?? [])
      .filter((pull) => !pull.isDraft && !pull.isCrossRepository)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );

const rollup = (pull) => pull.statusCheckRollup ?? [];

export const pullCheck = (pull) => {
  const check = rollup(pull).find((entry) => entry.__typename === 'CheckRun' && entry.name === 'check');

  return check?.status === 'COMPLETED' ? check.conclusion.toLowerCase() : null;
};

export const pullReview = (pull) => {
  const status = rollup(pull).find((entry) => entry.__typename === 'StatusContext' && entry.context === 'agent-review');

  return status ? status.state.toLowerCase() : null;
};

export const checkConclusion = (sha) => {
  const runs = json('gh', [
    'api',
    `repos/${repo()}/commits/${sha}/check-runs`,
    '--jq',
    '[.check_runs[] | select(.name == "check") | {status, conclusion}]',
  ]);
  const latest = runs?.[0];

  if (!latest || latest.status !== 'completed') return null;

  return latest.conclusion;
};

export const reviewState = (sha) =>
  json('gh', [
    'api',
    `repos/${repo()}/commits/${sha}/statuses`,
    '--jq',
    `[.[] | select(.context == "${REVIEW_CONTEXT}") | .state][0:1]`,
  ])?.[0] ?? null;

export const setReview = (sha, state, description) =>
  run('gh', [
    'api',
    '-X',
    'POST',
    `repos/${repo()}/statuses/${sha}`,
    '-f',
    `state=${state}`,
    '-f',
    `context=${REVIEW_CONTEXT}`,
    '-f',
    `description=${description.slice(0, 140)}`,
  ]);

export const commentOnPull = (number, body) =>
  run('gh', ['pr', 'comment', String(number), '--body-file', '-'], { input: withMark(body) });

export const mergePull = (number) =>
  run('gh', ['pr', 'merge', String(number), '--squash', '--delete-branch'], { allowFail: true });

export const createPull = ({ branch, title, body, label }) =>
  run(
    'gh',
    ['pr', 'create', '--base', 'main', '--head', branch, '--title', title, '--body-file', '-', '--label', label],
    { input: body },
  ).out;

export const latestMainCheck = () =>
  (json('gh', [
    'run',
    'list',
    '--workflow',
    'check.yml',
    '--branch',
    'main',
    '--event',
    'push',
    '--limit',
    '1',
    '--json',
    'databaseId,conclusion,status,headSha,createdAt',
  ]) ?? [])[0] ?? null;

export const lastFinishedMainCheck = () =>
  cached(
    'main-check',
    { ttlMs: 30_000 },
    () =>
      (
        json('gh', [
          'run',
          'list',
          '--workflow',
          'check.yml',
          '--branch',
          'main',
          '--event',
          'push',
          '--status',
          'completed',
          '--limit',
          '10',
          '--json',
          'databaseId,conclusion,status,headSha,createdAt',
        ]) ?? []
      ).find((run) => run.conclusion !== 'cancelled' && run.conclusion !== 'skipped') ?? null,
  );

export const failedLog = (runId) => run('gh', ['run', 'view', String(runId), '--log-failed'], { allowFail: true }).out;

export const isPaused = () =>
  run('gh', ['variable', 'get', 'LOOP_PAUSED'], { allowFail: true }).out.trim().toLowerCase() === 'true';

export const issues = (label) =>
  cached(
    `issues-${label}`,
    { ttlMs: 20_000 },
    () =>
      json('gh', [
        'issue',
        'list',
        '--state',
        'open',
        '--label',
        label,
        '--limit',
        '100',
        '--json',
        'number,title,body,author,labels,createdAt',
      ]) ?? [],
  );

export const editIssueLabels = (number, { add = [], remove = [] }) =>
  run('gh', [
    'issue',
    'edit',
    String(number),
    ...add.flatMap((label) => ['--add-label', label]),
    ...remove.flatMap((label) => ['--remove-label', label]),
  ]);

const openIssueTitles = () =>
  json('gh', ['issue', 'list', '--state', 'open', '--limit', '500', '--json', 'title', '--jq', '[.[].title]']) ?? [];

export const createIssue = ({ title, body, labels }) => {
  if (openIssueTitles().some((open) => sameTitle(open, title))) return null;

  return run(
    'gh',
    ['issue', 'create', '--title', title, '--body-file', '-', ...labels.flatMap((l) => ['--label', l])],
    {
      input: body,
    },
  ).out;
};

export const closeIssue = (number, comment) =>
  run('gh', ['issue', 'close', String(number), '--reason', 'completed', '--comment', comment], { allowFail: true });

export const ownerComments = (number, owner) =>
  json('gh', [
    'api',
    `repos/${repo()}/issues/${number}/comments?per_page=100`,
    '--jq',
    `[.[] | select(.user.login == "${owner}" and .performed_via_github_app == null) | {created_at, body}]`,
  ]) ?? [];

export const commentOnIssue = (number, body) =>
  run('gh', ['issue', 'comment', String(number), '--body-file', '-'], { input: withMark(body) });

export const openIssues = () =>
  json('gh', [
    'issue',
    'list',
    '--state',
    'open',
    '--limit',
    '300',
    '--json',
    'number,title,body,author,labels,createdAt,updatedAt',
  ]) ?? [];

export const editPullLabels = (number, { add = [], remove = [] }) =>
  run(
    'gh',
    [
      'pr',
      'edit',
      String(number),
      ...add.flatMap((label) => ['--add-label', label]),
      ...remove.flatMap((label) => ['--remove-label', label]),
    ],
    { allowFail: true },
  );

export const editPullBody = (number, body) =>
  run('gh', ['pr', 'edit', String(number), '--body-file', '-'], { input: body, allowFail: true });

export const pullComments = (number) =>
  json('gh', [
    'pr',
    'view',
    String(number),
    '--json',
    'comments',
    '--jq',
    '[.comments[] | {body, createdAt, author: .author.login}]',
  ]) ?? [];

export const isLoopComment = (comment) => comment.body.includes(LOOP_MARK) || comment.body.startsWith('### Review:');

export const checkRunFor = (sha) =>
  (json('gh', [
    'run',
    'list',
    '--commit',
    sha,
    '--workflow',
    'check.yml',
    '--limit',
    '1',
    '--json',
    'databaseId,conclusion,status',
  ]) ?? [])[0] ?? null;

export const hasLabel = (item, name) => (item.labels ?? []).some((label) => label.name === name);

export const closePull = (number, comment) =>
  run('gh', ['pr', 'close', String(number), '--delete-branch', '--comment', withMark(comment)], { allowFail: true });

export function appendToIssue(number, text) {
  const body = run('gh', ['issue', 'view', String(number), '--json', 'body', '--jq', '.body']).out;

  run('gh', ['issue', 'edit', String(number), '--body-file', '-'], { input: `${body}\n\n${text}`, allowFail: true });
}
