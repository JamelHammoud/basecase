import { repo } from './github.mjs';
import { json, run } from './sh.mjs';
import { parseDigest } from './stats.mjs';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const windowStart = (days = 7, now = Date.now()) =>
  new Date(now - days * DAY_MS).toISOString().replace(/\.\d+Z$/, 'Z');

const lines = (args) =>
  run('gh', args)
    .out.split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

const numberFrom = (field) => `(.${field} | split("/") | last | tonumber)`;

const commentFields = (since, urlField) =>
  `.[] | select(.created_at >= "${since}" and .performed_via_github_app == null) | {author: .user.login, body, url: .html_url, createdAt: .created_at, number: ${numberFrom(urlField)}}`;

export const issueComments = (since) =>
  lines([
    'api',
    '--paginate',
    `repos/${repo()}/issues/comments?since=${since}&per_page=100`,
    '--jq',
    commentFields(since, 'issue_url'),
  ]);

export const lineComments = (since) =>
  lines([
    'api',
    '--paginate',
    `repos/${repo()}/pulls/comments?since=${since}&per_page=100`,
    '--jq',
    commentFields(since, 'pull_request_url'),
  ]);

const PULL_FIELDS =
  'number,title,body,author,isCrossRepository,state,headRefName,labels,createdAt,mergedAt,closedAt,reviews';

export const pullsSince = (since, extraFields = []) =>
  json('gh', [
    'pr',
    'list',
    '--state',
    'all',
    '--limit',
    '500',
    '--search',
    `updated:>=${since.slice(0, 10)}`,
    '--json',
    [PULL_FIELDS, ...extraFields].join(','),
  ]) ?? [];

export const mainCommits = (since) =>
  lines([
    'api',
    '--paginate',
    `repos/${repo()}/commits?sha=main&since=${since}&per_page=100`,
    '--jq',
    '.[] | {sha, message: .commit.message, date: .commit.committer.date}',
  ]);

export const mainCheckRuns = () =>
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
    '300',
    '--json',
    'conclusion,status,createdAt,updatedAt,headSha',
  ]) ?? [];

export const openHeads = () =>
  json('gh', [
    'pr',
    'list',
    '--state',
    'open',
    '--limit',
    '500',
    '--json',
    'headRefName',
    '--jq',
    '[.[].headRefName]',
  ]) ?? [];

export const latestIssue = (label) =>
  (json('gh', ['issue', 'list', '--state', 'all', '--label', label, '--limit', '1', '--json', 'createdAt,body']) ??
    [])[0] ?? null;

export const issuesSince = (since) =>
  json('gh', [
    'issue',
    'list',
    '--state',
    'all',
    '--limit',
    '500',
    '--search',
    `updated:>=${since.slice(0, 10)}`,
    '--json',
    'number,labels,createdAt,closedAt,stateReason',
  ]) ?? [];

export const digestWorst = () => parseDigest(latestIssue('loop:digest')?.body)?.worst ?? null;
