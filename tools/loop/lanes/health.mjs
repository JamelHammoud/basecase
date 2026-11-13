import { breaches, LIMITS } from '../lib/flow.mjs';
import { queuedRuns } from '../lib/flowCounts.mjs';
import { openPulls, pullCheck, pullReview } from '../lib/github.mjs';
import { LOOP_MARK } from '../lib/mark.mjs';
import { json, run } from '../lib/sh.mjs';
import { eligible } from './batch.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 600,
  labels: ['loop:health'],
  does: 'Watches main, the merge queue and CI, and keeps one Loop health issue open while any of them stalls',
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

export const redSince = (runs) => {
  const finished = runs.filter((r) => r.conclusion !== 'cancelled' && r.conclusion !== 'skipped');
  const firstGreen = finished.findIndex((r) => r.conclusion === 'success');
  const red = firstGreen === -1 ? finished : finished.slice(0, firstGreen);

  return red.length > 0 ? red.at(-1).createdAt : null;
};

const oldest = (items) => items.map((item) => item.createdAt).sort()[0] ?? null;

function measure() {
  const pulls = openPulls({ fresh: true });
  const ready = pulls.filter(
    (pull) => eligible(pull) || (pullCheck(pull) === 'success' && pullReview(pull) === 'success'),
  );
  const queued = queuedRuns();
  const lastMerge = json('gh', ['pr', 'list', '--state', 'merged', '--limit', '1', '--json', 'mergedAt'])?.[0];

  return {
    mainRedSince: redSince(mainRuns()),
    lastMergeAt: lastMerge?.mergedAt ?? null,
    readyCount: ready.length,
    oldestReadyAt: oldest(ready),
    queuedRuns: queued.length,
    oldestQueuedAt: oldest(queued),
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
    'What the loop already does about it: lanes that open pull requests wait while too much is queued (backpressure), repairs land first, and reviewed work lands in batches. If this stays open for hours, the merge path itself is broken and the retro lane will see it.',
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

export default function health({ log }) {
  const m = measure();
  const found = breaches(m);
  const issue = openIssue();

  if (found.length === 0) return settle(issue, log);

  const body = report(found, m);

  if (issue) run('gh', ['issue', 'edit', String(issue.number), '--body-file', '-'], { input: body });
  else run('gh', ['issue', 'create', '--title', TITLE, '--label', LABEL, '--body-file', '-'], { input: body });

  log(`stalling: ${found.join('; ')}`);
}
