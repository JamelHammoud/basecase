import fs from 'node:fs';
import path from 'node:path';
import { LOOP_DIR } from './paths.mjs';
import { quotaState } from './quota.mjs';
import { accountBurn } from './accountBurn.mjs';
import { weeklyForecast } from './agentPolicy.mjs';

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

export const tokenCount = (usage) =>
  (usage?.input_tokens ?? 0) +
  (usage?.output_tokens ?? 0) +
  (usage?.cache_read_input_tokens ?? 0) +
  (usage?.cache_creation_input_tokens ?? 0);

export const cachedInputTokens = (usage) => (usage?.cached_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0);

export function usageReport({ since, now = Date.now() } = {}) {
  const sessions = sessionRecords({ since });
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
    lanes: Object.fromEntries(
      Object.entries(byLane).map(([lane, records]) => [
        lane,
        {
          sessions: records.length,
          completed: records.filter((record) => record.state === 'completed').length,
          failed: records.filter((record) => record.ok === false).length,
          tokens: records.reduce(
            (total, record) => total + tokenCount(record.usage) + tokenCount(record.previousUsage),
            0,
          ),
          cachedInputTokens: records.reduce(
            (total, record) => total + cachedInputTokens(record.usage) + cachedInputTokens(record.previousUsage),
            0,
          ),
          continued: records.filter((record) => record.continued).length,
          milliseconds: records.reduce((total, record) => total + (record.durationMs ?? 0), 0),
        },
      ]),
    ),
  };
}
