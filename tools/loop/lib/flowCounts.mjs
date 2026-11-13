import { isBatch } from './landing.mjs';
import { cached } from './cache.mjs';
import { laneOf } from './flow.mjs';
import { openPulls } from './github.mjs';
import { isRepair } from './rank.mjs';
import { json } from './sh.mjs';

export const queuedRuns = ({ fresh = false } = {}) =>
  cached(
    'queued-runs',
    { ttlMs: 60_000, refresh: fresh },
    () => json('gh', ['run', 'list', '--status', 'queued', '--limit', '200', '--json', 'createdAt']) ?? [],
  );

export const waitingPulls = (pulls = openPulls()) => pulls.filter((pull) => !isBatch(pull) && !isRepair(pull));

export function flowCounts() {
  const waiting = waitingPulls();
  const byLane = Object.groupBy(waiting, (pull) => laneOf(pull.headRefName) ?? 'other');

  return {
    openWaiting: waiting.length,
    queuedRuns: queuedRuns().length,
    byLane: Object.fromEntries(Object.entries(byLane).map(([lane, pulls]) => [lane, pulls.length])),
  };
}
