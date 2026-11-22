const METADATA = new Set([
  'extra_usage',
  'model_scoped',
  'spend',
  'member_dashboard_available',
  'seven_day_breakdown',
  'weekly_scoped_shares',
]);
const resetTime = (value) => Math.floor(Date.parse(value) / 1000) * 1000;

const validWindow = (window) =>
  Number.isFinite(window?.utilization) &&
  window.utilization >= 0 &&
  window.utilization <= 100 &&
  Number.isFinite(Date.parse(window.resets_at));

export function claudeWindows(usage) {
  const limits = usage?.rate_limits;

  if (!usage?.rate_limits_available || !limits) return [];

  if (limits.limits !== undefined) return serverWindows(limits.limits);

  if (limits.five_hour === undefined || !limits.seven_day) return [];

  const ordinary = Object.entries(limits).filter(
    ([name, window]) => !METADATA.has(name) && window !== null && window !== undefined,
  );
  const scoped = limits.model_scoped ?? [];
  const shares = limits.weekly_scoped_shares ?? [];

  if (!Array.isArray(scoped) || !Array.isArray(shares) || shares.length > scoped.length) return [];

  const windows = [
    ['seven_day', limits.seven_day],
    ...ordinary.filter(([name]) => name !== 'seven_day'),
    ...scoped.map((window) => [`model:${window?.display_name}`, window]),
  ];

  if (windows.some(([, window]) => !validWindow(window))) return [];

  return windows.map(([name, window]) => ({
    bucket: name,
    used: window.utilization,
    minutes: name === 'five_hour' ? 300 : 10080,
    reset: resetTime(window.resets_at),
  }));
}

function serverWindows(limits) {
  if (!Array.isArray(limits) || !limits.some((limit) => limit?.kind === 'weekly_all')) return [];

  const windows = limits
    .toSorted((a, b) => Number(b?.kind === 'weekly_all') - Number(a?.kind === 'weekly_all'))
    .map((limit) => ({
      bucket: limit?.kind === 'weekly_all' ? 'seven_day' : `${limit?.kind}:${limit?.scope?.model?.display_name ?? ''}`,
      used: limit?.percent,
      minutes: limit?.group === 'weekly' ? 10080 : 300,
      reset: resetTime(limit?.resets_at),
    }));

  if (
    limits.some((limit) => !['weekly', 'session'].includes(limit?.group)) ||
    windows.some(
      (window) =>
        !Number.isFinite(window.used) || window.used < 0 || window.used > 100 || !Number.isFinite(window.reset),
    )
  )
    return [];

  return windows;
}
