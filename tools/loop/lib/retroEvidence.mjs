import fs from 'node:fs';
import path from 'node:path';
import { cached } from './cache.mjs';
import { isOwnerNote, isRevert, reviewNotes } from './evidence.mjs';
import { issues, repo } from './github.mjs';
import { issueComments, lineComments, mainCheckRuns, mainCommits, pullsSince, windowStart } from './history.mjs';
import { inWindow, lanesHealth, parseLog } from './logs.mjs';
import { LOGS, OWNER_LOGIN } from './paths.mjs';
import {
  blockerFindings,
  blockerTypes,
  checkRuns,
  closedUnmerged,
  declinesByStep,
  mergeTimesByKind,
  nearDuplicates,
  pullSizes,
  queueTimes,
  verdicts,
  waitingSteps,
} from './retro.mjs';
import { json } from './sh.mjs';
import { redHours } from './stats.mjs';

const SAMPLED_RUNS = 40;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const readLogs = () =>
  fs.existsSync(LOGS)
    ? fs
        .readdirSync(LOGS)
        .filter((file) => file.endsWith('.log') && !file.startsWith('launchd-'))
        .flatMap((file) => parseLog(fs.readFileSync(path.join(LOGS, file), 'utf8')))
    : [];

const launchdErrors = () =>
  fs.existsSync(LOGS)
    ? fs
        .readdirSync(LOGS)
        .filter((file) => file.startsWith('launchd-') && fs.statSync(path.join(LOGS, file)).size > 0)
        .map((file) => ({ file, tail: fs.readFileSync(path.join(LOGS, file), 'utf8').trim().slice(-400) }))
    : [];

const digests = () =>
  json('gh', [
    'issue',
    'list',
    '--state',
    'all',
    '--label',
    'loop:digest',
    '--limit',
    '3',
    '--json',
    'number,title,body,createdAt',
  ]) ?? [];

const checkRunsSince = (since) =>
  json('gh', [
    'run',
    'list',
    '--workflow',
    'check.yml',
    '--created',
    `>=${since}`,
    '--limit',
    '1000',
    '--json',
    'databaseId,event,status,conclusion,createdAt,updatedAt',
  ]) ?? [];

const runJobs = (id) =>
  cached(
    `retro-jobs-${id}`,
    { ttlMs: WEEK_MS },
    () =>
      json('gh', [
        'api',
        `repos/${repo()}/actions/runs/${id}/jobs?per_page=100`,
        '--jq',
        '[.jobs[] | {name, conclusion, created_at, started_at}]',
      ]) ?? [],
  );

function ciEvidence(since, now) {
  const runs = checkRunsSince(since);
  const sampled = runs
    .filter((r) => r.status === 'completed' && ['success', 'failure'].includes(r.conclusion))
    .slice(0, SAMPLED_RUNS)
    .map((r) => ({ id: r.databaseId, jobs: runJobs(r.databaseId) }));
  const queued = runs.filter((r) => ['queued', 'pending', 'waiting'].includes(r.status));

  return { runs: checkRuns(runs), queue: queueTimes({ sampled, queued, now }) };
}

const issuesSince = (since) =>
  json('gh', [
    'issue',
    'list',
    '--state',
    'all',
    '--limit',
    '500',
    '--search',
    `created:>=${since.slice(0, 10)}`,
    '--json',
    'number,title,state,labels',
  ]) ?? [];

const clip = (text, chars) => (text.length > chars ? `${text.slice(0, chars)}…` : text);

function reviewEvidence(comments) {
  const findings = blockerFindings(comments, OWNER_LOGIN);

  return {
    verdicts: verdicts(comments, OWNER_LOGIN),
    blockerTypes: blockerTypes(findings),
    blockerSamples: findings.slice(-30).map((f) => ({ number: f.number, text: clip(f.text, 220) })),
  };
}

function pullEvidence(pulls) {
  const own = pulls.filter((p) => p.author?.login === OWNER_LOGIN);

  return {
    opened: own.length,
    open: own.filter((p) => p.state === 'OPEN').length,
    mergeHours: mergeTimesByKind(own),
    sizes: pullSizes(own),
    closed: closedUnmerged(own, OWNER_LOGIN).map((p) => ({ number: p.number, title: p.title })),
    openLoop: own
      .filter((p) => p.state === 'OPEN' && p.headRefName.startsWith('loop/loop/'))
      .map((p) => ({ number: p.number, title: p.title })),
  };
}

export function retroEvidence(now = Date.now()) {
  const from = windowStart(7, now);
  const to = new Date(now).toISOString();
  const entries = inWindow(readLogs(), { from, to });
  const pulls = pullsSince(from, ['additions', 'deletions']);
  const comments = [...issueComments(from), ...lineComments(from)];
  const notes = [...comments, ...reviewNotes(pulls).filter((c) => c.createdAt >= from)];
  const createdIssues = issuesSince(from);

  return {
    from,
    to,
    digests: digests().map((d) => ({ number: d.number, title: d.title, body: d.body })),
    lanes: lanesHealth(entries),
    launchd: launchdErrors(),
    pulls: pullEvidence(pulls),
    reviews: reviewEvidence(comments),
    reverts: mainCommits(from)
      .filter((c) => isRevert(c.message))
      .map((c) => `${c.sha.slice(0, 7)} ${c.message.split('\n')[0]}`),
    redHours: redHours(mainCheckRuns(), { from, to }),
    ci: ciEvidence(from, now),
    steps: waitingSteps({
      steps: issues('loop:next'),
      declines: declinesByStep(entries.filter((e) => e.lane === 'build')),
      now,
    }).slice(0, 10),
    ownerNotes: notes
      .filter((c) => isOwnerNote(c, OWNER_LOGIN))
      .map((c) => ({ number: c.number, at: c.createdAt, body: clip(c.body, 600) })),
    duplicates: {
      pulls: nearDuplicates(pulls),
      issues: nearDuplicates(createdIssues.filter((i) => !(i.labels ?? []).some((l) => l.name === 'loop:digest'))),
    },
  };
}
