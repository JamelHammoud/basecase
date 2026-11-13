import { breaches, expired, lastMergeAt, LIMITS, readySince, redSince } from '../lib/flow.mjs';
import { queuedRuns } from '../lib/flowCounts.mjs';
import { closePull, isPaused, openPulls, pullCheck, pullReview } from '../lib/github.mjs';
import { LOOP_MARK } from '../lib/mark.mjs';
import { isRepair } from '../lib/rank.mjs';
import { json, run } from '../lib/sh.mjs';
import { membersOf } from '../lib/evidence.mjs';
import { eligible, isBatch } from './batch.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 600,
  labels: ['loop:health'],
  does: 'Closes pull requests open over six hours, watches main, the merge queue and CI, and keeps one Loop health issue open while any of them stalls',
};

const TITLE = 'Loop health';
const LABEL = 'loop:health';

const mainRuns = () =>
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
    '50',
    '--json',
    'conclusion,createdAt',
  ]) ?? [];

const recentlyMerged = () =>
  json('gh', [
    'pr',
    'list',
    '--state',
    'merged',
    '--search',
    'sort:updated-desc',
    '--limit',
    '20',
    '--json',
    'mergedAt',
  ]) ?? [];

const repairReady = (pull) =>
  isRepair(pull) && pull.mergeable !== 'CONFLICTING' && pullCheck(pull) === 'success' && pullReview(pull) === 'success';

const oldest = (times) => times.filter(Boolean).sort()[0] ?? null;

function measure() {
  const ready = openPulls({ fresh: true }).filter((pull) => eligible(pull) || repairReady(pull));
  const queued = queuedRuns({ fresh: true });

  return {
    mainRedSince: redSince(mainRuns()),
    lastMergeAt: lastMergeAt(recentlyMerged()),
    readyCount: ready.length,
    oldestReadyAt: oldest(ready.map(readySince)),
    queuedRuns: queued.length,
    oldestQueuedAt: oldest(queued.map((item) => item.createdAt)),
  };
}

const report = (found, m) =>
  [
    `The loop is stalling. Checked ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
    '',
    ...found.map((line) => `- ${line}`),
    '',
    '| Measure | Now | Limit |',
    '|---|---|---|',
    `| Reviewed, green pull requests waiting | ${m.readyCount} | merged within ${LIMITS.readyWaitingHours} h |`,
    `| CI runs queued | ${m.queuedRuns} | ${LIMITS.queuedRuns} |`,
    `| main red since | ${m.mainRedSince ?? 'green'} | ${LIMITS.mainRedHours} h |`,
    `| Last merge | ${m.lastMergeAt ?? 'never'} | ${LIMITS.noMergeHours} h while work waits |`,
    '',
    'What the loop already does about it: lanes that open pull requests wait while too much is queued (backpressure), repairs land first, and reviewed work lands in batches. If this stays open for hours, the merge path itself is broken.',
    '',
    LOOP_MARK,
  ].join('\n');

const openIssue = () =>
  json('gh', ['issue', 'list', '--state', 'open', '--label', LABEL, '--limit', '1', '--json', 'number'])?.[0] ?? null;

function settle(issue, log) {
  if (!issue) return log('healthy');

  run('gh', ['issue', 'close', String(issue.number), '--comment', `Flowing again.\n\n${LOOP_MARK}`]);
  log(`healthy; closed #${issue.number}`);
}

function expire(log) {
  if (isPaused()) return;

  const pulls = openPulls({ fresh: true });
  const inBatch = pulls.filter(isBatch).flatMap((batch) => membersOf(batch.body));

  for (const pull of expired({ pulls, inBatch })) {
    closePull(
      pull.number,
      `Open over ${LIMITS.maxOpenHours} hours without landing, so it closes. Its step goes back to the builders and is rebuilt from current main, which costs less than keeping it up to date.`,
    );
    log(`#${pull.number}: open over ${LIMITS.maxOpenHours} h; closed`);
  }
}

export default function health({ log }) {
  expire(log);

  const m = measure();
  const found = breaches(m);
  const issue = openIssue();

  if (found.length === 0) return settle(issue, log);

  const body = report(found, m);

  if (issue) run('gh', ['issue', 'edit', String(issue.number), '--body-file', '-'], { input: body });
  else run('gh', ['issue', 'create', '--title', TITLE, '--label', LABEL, '--body-file', '-'], { input: body });

  log(`stalling: ${found.join('; ')}`);
}
