const validWindow = (window) =>
  Number.isFinite(window?.utilization) &&
  window.utilization >= 0 &&
  window.utilization <= 100 &&
  Number.isFinite(Date.parse(window.resets_at));

export function claudeWindows(usage) {
  const limits = usage?.rate_limits;

  if (!usage?.rate_limits_available || !limits?.five_hour || !limits.seven_day) return [];

  const ordinary = Object.entries(limits).filter(
    ([name, window]) => name !== 'extra_usage' && name !== 'model_scoped' && window,
  );
  const scoped = limits.model_scoped ?? [];

  if (!Array.isArray(scoped)) return [];

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
    reset: Date.parse(window.resets_at),
  }));
}
