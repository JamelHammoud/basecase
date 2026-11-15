const DEEP = new Set(['review', 'repair', 'doctor', 'rebuild', 'retro']);
const WRITING = new Set(['voice', 'ideas', 'groom']);

export const policyFor = (name) => ({
  provider: process.env.BASECASE_LOOP_PROVIDER || 'codex',
  model: process.env.CODEX_MODEL || 'gpt-6.1-sol',
  effort: process.env.CODEX_EFFORT || (DEEP.has(name) ? 'high' : 'medium'),
  claudeModel: process.env.BASECASE_LOOP_CLAUDE_MODEL || 'sonnet',
  claudeEffort: WRITING.has(name) ? 'medium' : 'high',
});

export function overflowAvailable({ used, baseline, now = Date.now() }) {
  if (!used || now - used.at > 5 * 60_000) return false;

  const weekly = used.windows.find((window) => window.minutes === 10080);

  if (!weekly || weekly.used >= 80 || weekly.reset <= now || used.windows.some((window) => window.used >= 80))
    return false;

  if (!baseline || baseline.reset !== weekly.reset) return true;

  return weekly.used - baseline.used < 5;
}

export const primaryReserve = (snapshot, now = Date.now()) =>
  snapshot?.windows.find((window) => window.minutes === 10080 && window.used >= 90 && window.reset > now);

export const primaryAvailable = (snapshot, now = Date.now()) =>
  snapshot?.at >= now - 60_000 &&
  snapshot.windows.some((window) => window.minutes === 10080 && window.used < 90 && window.reset > now) &&
  snapshot.windows.every((window) => window.used < 100);

export const weeklyForecast = ({ used, reset, now = Date.now() }) => {
  const week = 7 * 24 * 60 * 60_000;
  const elapsed = week - (reset - now);

  return elapsed > 0 && elapsed <= week ? (used * week) / elapsed : null;
};
