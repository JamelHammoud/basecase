import { cached } from './cache.mjs';
import { LOOP_MARK, withMark } from './mark.mjs';
import { json, run } from './sh.mjs';
import { openMatch } from './titles.mjs';

const REVIEW_CONTEXT = 'agent-review';
let slug;

export const repo = () => {
  slug ??= run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).out;

  return slug;
};

const PULL_FIELDS =
  'number,title,body,url,headRefName,headRefOid,isDraft,isCrossRepository,createdAt,mergeable,labels,updatedAt,statusCheckRollup';

export const openPulls = ({ fresh = false } = {}) =>
  cached('open-pulls', { ttlMs: 20_000, refresh: fresh }, () =>
    (json('gh', ['pr', 'list', '--state', 'open', '--limit', '200', '--json', PULL_FIELDS]) ?? [])
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

export const mergePull = (number, method = 'squash') =>
  run('gh', ['pr', 'merge', String(number), `--${method}`, '--delete-branch'], { allowFail: true });

const MISSING_LABEL = /'(loop:[a-z-]+)' not found/;

export const missingLabel = (stderr) => MISSING_LABEL.exec(stderr)?.[1] ?? null;

function ghCreating(args, { input, tries = 4 }) {
  const result = run('gh', args, { input, allowFail: true });
  const label = result.ok ? null : missingLabel(result.err);

  if (result.ok) return result.out;

  if (!label || tries <= 1) throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${result.err.slice(-2000)}`);

  run('gh', ['label', 'create', label, '--color', '6e7781', '--force']);

  return ghCreating(args, { input, tries: tries - 1 });
}

export const createPull = ({ branch, title, body, label }) =>
  ghCreating(
    ['pr', 'create', '--base', 'main', '--head', branch, '--title', title, '--body-file', '-', '--label', label],
    {
      input: body,
    },
  );

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

const FINAL = new Set(['success', 'failure', 'timed_out']);

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const jobConclusions = (run) =>
  cached(
    `jobs-${run.databaseId}`,
    { ttlMs: run.status === 'completed' ? WEEK_MS : 60_000 },
    () =>
      json('gh', ['api', `repos/${repo()}/actions/runs/${run.databaseId}/jobs`, '--jq', '[.jobs[].conclusion]']) ?? [],
  );

const failedJob = (run) =>
  jobConclusions(run).some((conclusion) => conclusion === 'failure' || conclusion === 'timed_out');

export const verdictOf = (runs, hasFailedJob) => {
  for (const run of runs) {
    if (run.status === 'completed' && FINAL.has(run.conclusion)) return run;

    if (hasFailedJob(run)) return { ...run, conclusion: 'failure' };
  }

  return null;
};

export const lastFinishedMainCheck = () =>
  cached('main-check', { ttlMs: 60_000 }, () =>
    verdictOf(
      json('gh', [
        'run',
        'list',
        '--workflow',
        'check.yml',
        '--branch',
        'main',
        '--event',
        'push',
        '--limit',
        '100',
        '--json',
        'databaseId,conclusion,status,headSha,createdAt',
      ]) ?? [],
      failedJob,
    ),
  );

const JOB_LOG_CHARS = 40_000;

const failedJobLogs = (runId) =>
  (
    json('gh', [
      'api',
      `repos/${repo()}/actions/runs/${runId}/jobs`,
      '--jq',
      '[.jobs[] | select(.conclusion == "failure" or .conclusion == "timed_out") | {id, name}]',
    ]) ?? []
  )
    .map(({ id, name }) => {
      const log = run('gh', ['api', `repos/${repo()}/actions/jobs/${id}/logs`], { allowFail: true }).out;

      return `## ${name}\n\n${log.slice(-JOB_LOG_CHARS)}`;
    })
    .join('\n\n');

export const failedLog = (runId) =>
  run('gh', ['run', 'view', String(runId), '--log-failed'], { allowFail: true }).out || failedJobLogs(runId);

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
        'number,title,body,author,labels,createdAt,updatedAt',
      ]) ?? [],
  );

const labelArgs = ({ add = [], remove = [] }) => [
  ...add.flatMap((label) => ['--add-label', label]),
  ...remove.flatMap((label) => ['--remove-label', label]),
];

export const editIssueLabels = (number, change) =>
  ghCreating(['issue', 'edit', String(number), ...labelArgs(change)], {});

const openIssueSummaries = () =>
  json('gh', [
    'issue',
    'list',
    '--state',
    'open',
    '--limit',
    '500',
    '--json',
    'number,title,url,labels',
    '--jq',
    '[.[] | {number, title, url, labels: [.labels[].name]}]',
  ]) ?? [];

export const findOpenIssue = ({ title, similarAmong }) => openMatch(title, openIssueSummaries(), similarAmong);

export const createIssue = ({ title, body, labels, similarAmong }) => {
  if (findOpenIssue({ title, similarAmong })) return null;

  return ghCreating(
    ['issue', 'create', '--title', title, '--body-file', '-', ...labels.flatMap((l) => ['--label', l])],
    {
      input: body,
    },
  );
};

export const closeIssue = (number, comment, reason = 'completed') =>
  run('gh', ['issue', 'close', String(number), '--reason', reason, '--comment', withMark(comment)], {
    allowFail: true,
  });

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

export function editPullLabels(number, change) {
  try {
    return ghCreating(['pr', 'edit', String(number), ...labelArgs(change)], {});
  } catch {
    return null;
  }
}

export const editPull = (number, { title, body }) =>
  run('gh', ['pr', 'edit', String(number), ...(title ? ['--title', title] : []), '--body-file', '-'], {
    input: body,
    allowFail: true,
  });

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

export const issueIsOpen = (number) =>
  run('gh', ['issue', 'view', String(number), '--json', 'state', '--jq', '.state'], { allowFail: true }).out.trim() ===
  'OPEN';

const STUCK_AFTER_MS = 60 * 60 * 1000;

export const stuckRuns = (runs, now) =>
  runs.filter((r) => r.status !== 'completed' && now - Date.parse(r.createdAt) > STUCK_AFTER_MS);

export function unstickMainChecks(log, now = Date.now()) {
  const unfinished =
    json('gh', [
      'run',
      'list',
      '--workflow',
      'check.yml',
      '--branch',
      'main',
      '--limit',
      '30',
      '--json',
      'databaseId,status,createdAt,headSha',
    ]) ?? [];

  for (const stuck of stuckRuns(unfinished, now)) {
    const done = run('gh', ['api', '-X', 'POST', `repos/${repo()}/actions/runs/${stuck.databaseId}/force-cancel`], {
      allowFail: true,
    }).ok;

    log(
      `${done ? 'force-cancelled' : 'could not cancel'} Check on main at ${stuck.headSha.slice(0, 7)}, unfinished after an hour`,
    );
  }
}
