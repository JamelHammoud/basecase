import { claim } from './claim.mjs';
import { primaryAvailable } from './agentPolicy.mjs';
import { quotaSnapshot } from './quota.mjs';
import { sessionRecords } from './sessionJournal.mjs';
import { sessionTotals } from './usageTotals.mjs';

const DAY = 24 * 60 * 60_000;
const WEEK_MINUTES = 7 * 24 * 60;
const REFINEMENT_SHARE = 0.1;
const WEEKLY_TARGET = 90;

function measuredWork(records) {
  const totals = sessionTotals(records);

  return { measured: totals.measuredTokens, missing: totals.missingUsage };
}

export function refinementWorkBudget(records) {
  const standalone = records.filter((record) => (record.lane ?? record.name) === 'refine');
  const other = records.filter((record) => (record.lane ?? record.name) !== 'refine');
  const groups = Map.groupBy(standalone, (record) => record.workId ?? record.task ?? record.id);
  const work = [...groups.values()].map(measuredWork);
  const completed = work.filter(({ measured, missing }) => measured > 0 && !missing);
  const otherWork = measuredWork(other);
  const estimate = completed.length
    ? Math.ceil(completed.reduce((total, work) => total + work.measured, 0) / completed.length)
    : Math.ceil(otherWork.measured / Math.max(1, other.length - otherWork.missing));
  const spent = work.reduce(
    (total, { measured, missing }) => total + (missing ? Math.max(measured, estimate) : measured),
    0,
  );
  const allowance = Math.floor((otherWork.measured * REFINEMENT_SHARE) / (1 - REFINEMENT_SHARE));

  return { spent, estimate, allowance };
}

export function refinementQuotaHold(snapshot, now) {
  if (!primaryAvailable(snapshot, now)) return 'standalone refinement needs fresh Codex allowance';

  const weekly = snapshot.windows.filter((window) => window.minutes === WEEK_MINUTES && window.reset > now);
  const ahead = weekly.some(({ used, reset }) => {
    const elapsed = 1 - (reset - now) / DAY / 7;

    return used > Math.max(0, elapsed * WEEKLY_TARGET) + 1;
  });

  return ahead ? 'Codex usage is ahead of the weekly plan for standalone refinements' : null;
}

function refinementHold() {
  const now = Date.now();
  const { spent, estimate, allowance } = refinementWorkBudget(sessionRecords({ since: now - DAY }));

  if (estimate === 0 || spent + estimate > allowance) return 'standalone refinement reached its 24-hour work budget';

  const snapshot = quotaSnapshot('codex');

  return refinementQuotaHold(snapshot, Date.now());
}

export function runWithinRefinementBudget(run, log) {
  const release = claim('standalone-refinement');

  if (!release) {
    log('waiting: another standalone refinement is running');

    return;
  }

  try {
    const hold = refinementHold();

    if (hold) {
      log(`waiting: ${hold}`);

      return;
    }

    return run();
  } finally {
    release();
  }
}
