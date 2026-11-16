import fs from 'node:fs';
import path from 'node:path';
import { LOOP_DIR } from './paths.mjs';
import { quotaState } from './quota.mjs';
import { accountBurn } from './accountBurn.mjs';
import { weeklyForecast } from './agentPolicy.mjs';
import { pullHistory } from './stepPulls.mjs';
import { publicationRecords } from './publicationJournal.mjs';
import { completionWindow } from './usageCompletions.mjs';
import { taskUsage } from './usageTasks.mjs';
import { sessionTotals } from './usageTotals.mjs';

export { cachedInputTokens, tokenCount } from './usageTotals.mjs';

export function sessionRecords({ since = Date.now() - 24 * 60 * 60_000 } = {}) {
  const dir = path.join(LOOP_DIR, 'state', 'sessions');

  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      try {
        const entry = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

        return entry.startedAt >= since ? [entry] : [];
      } catch {
        return [];
      }
    });
}

export function usageReport({ now = Date.now(), since = now - 86_400_000 } = {}) {
  const retained = sessionRecords({ since: 0 });
  const sessions = retained.filter((record) => record.startedAt >= since && record.startedAt < now);
  let pulls;

  try {
    pulls = pullHistory();
  } catch {
    pulls = null;
  }

  const publications = publicationRecords();
  const retainedWork = taskUsage(retained, pulls, publications);
  const byLane = Object.groupBy(sessions, (session) => session.lane ?? session.name);
  const codex = quotaState('codex');
  const weekly = codex.windows.find((window) => window.minutes === 10080);

  return {
    at: now,
    defaultProvider: process.env.BASECASE_LOOP_PROVIDER || 'codex',
    weeklyTarget: 90,
    emergencyReserve: 10,
    quota: { codex, claude: quotaState('claude') },
    accountBurn: accountBurn({
      current: codex,
      samples: sessions
        .filter((session) => session.provider === 'codex')
        .flatMap((session) => [session.quotaBefore, session.quotaAfter]),
      now,
    }),
    projectedWeeklyUsage: weekly ? weeklyForecast({ used: weekly.used, reset: weekly.reset, now }) : null,
    sessions: sessions.length,
    publications,
    completedSessions: sessions.filter((session) => session.state === 'completed').length,
    taskWork: sessions.length === retained.length ? retainedWork : taskUsage(sessions, pulls, publications),
    retention: {
      since: retained.length ? Math.min(...retained.map((record) => record.startedAt)) : null,
      sessions: retained.length,
    },
    completionWindow: completionWindow(retainedWork, { since, until: now, pulls }),
    lanes: Object.fromEntries(
      Object.entries(byLane).map(([lane, records]) => [
        lane,
        {
          completed: records.filter((record) => record.state === 'completed').length,
          failed: records.filter((record) => record.ok === false).length,
          ...sessionTotals(records),
          continued: records.filter((record) => record.continued).length,
        },
      ]),
    ),
  };
}
