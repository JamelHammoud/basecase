export const NIGHTLY_HOUR_UTC = 9;
export const GRACE_MINUTES = 45;

export function nightlyDue(now, lastRunAt) {
  const due = new Date(now);

  due.setUTCHours(NIGHTLY_HOUR_UTC, GRACE_MINUTES, 0, 0);

  if (now < due) due.setUTCDate(due.getUTCDate() - 1);

  const dayStart = new Date(due);

  dayStart.setUTCHours(0, 0, 0, 0);

  return !lastRunAt || new Date(lastRunAt) < dayStart;
}
