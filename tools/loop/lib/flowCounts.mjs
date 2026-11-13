import { isBatch } from '../lanes/batch.mjs';
import { openPulls } from './github.mjs';
import { isRepair } from './rank.mjs';
import { json } from './sh.mjs';

export const queuedRuns = () =>
  json('gh', ['run', 'list', '--status', 'queued', '--limit', '200', '--json', 'createdAt']) ?? [];

export const waitingPulls = (pulls = openPulls()) => pulls.filter((pull) => !isBatch(pull) && !isRepair(pull));

export const flowCounts = () => ({ openWaiting: waitingPulls().length, queuedRuns: queuedRuns().length });
