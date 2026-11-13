import { json, run } from './sh.mjs';

const REVIEW_CONTEXT = 'agent-review';
let slug;

export const repo = () => {
  slug ??= run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).out;

  return slug;
};

const PULL_FIELDS = 'number,title,body,headRefName,headRefOid,isDraft,isCrossRepository,createdAt,mergeable';

export const openPulls = () =>
  (json('gh', ['pr', 'list', '--state', 'open', '--limit', '100', '--json', PULL_FIELDS]) ?? [])
    .filter((pull) => !pull.isDraft && !pull.isCrossRepository)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

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
    `[.[] | select(.context == "${REVIEW_CONTEXT}") | .state][0]`,
  ]);

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
  run('gh', ['pr', 'comment', String(number), '--body-file', '-'], { input: body });

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

export const failedLog = (runId) => run('gh', ['run', 'view', String(runId), '--log-failed'], { allowFail: true }).out;

export const isPaused = () =>
  run('gh', ['variable', 'get', 'LOOP_PAUSED'], { allowFail: true }).out.trim().toLowerCase() === 'true';

export const issues = (label) =>
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
  ]) ?? [];

export const editIssueLabels = (number, { add = [], remove = [] }) =>
  run('gh', [
    'issue',
    'edit',
    String(number),
    ...add.flatMap((label) => ['--add-label', label]),
    ...remove.flatMap((label) => ['--remove-label', label]),
  ]);

export const createIssue = ({ title, body, labels }) =>
  run('gh', ['issue', 'create', '--title', title, '--body-file', '-', ...labels.flatMap((l) => ['--label', l])], {
    input: body,
  }).out;

export const ownerComments = (number, owner) =>
  json('gh', [
    'api',
    `repos/${repo()}/issues/${number}/comments?per_page=100`,
    '--jq',
    `[.[] | select(.user.login == "${owner}" and .performed_via_github_app == null) | {created_at, body}]`,
  ]) ?? [];
