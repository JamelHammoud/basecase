import fs from 'node:fs';
import path from 'node:path';
import { LOOP_DIR } from './paths.mjs';
import { quotaState } from './quota.mjs';
import { accountBurn } from './accountBurn.mjs';
import { weeklyForecast } from './agentPolicy.mjs';
import { stepPullIndex } from './stepPulls.mjs';
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

export function usageReport({ since, now = Date.now() } = {}) {
  const sessions = sessionRecords({ since });
  let pulls = null;

  try {
    const index = stepPullIndex();

    if (index) pulls = [...new Map([...index.values()].flat().map((pull) => [pull.number, pull])).values()];
  } catch {
    pulls = null;
  }

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
    completedSessions: sessions.filter((session) => session.state === 'completed').length,
    taskWork: taskUsage(sessions, pulls),
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
