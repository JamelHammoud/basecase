export const NIGHTLY_HOUR_UTC = 9;
export const SUITE_HOUR_UTC = 6;
export const GRACE_MINUTES = 45;

const HOUR_MS = 3_600_000;

function lastDue(now, hour) {
  const due = new Date(now);

  due.setUTCHours(hour, GRACE_MINUTES, 0, 0);

  if (now < due) due.setUTCDate(due.getUTCDate() - 1);

  return due;
}

const dayOf = (date) => {
  const start = new Date(date);

  start.setUTCHours(0, 0, 0, 0);

  return start;
};

export function nightlyDue(now, lastRunAt, hour = NIGHTLY_HOUR_UTC) {
  const dayStart = dayOf(lastDue(now, hour));

  return !lastRunAt || new Date(lastRunAt) < dayStart;
}

export const suiteDue = (now, lastSuiteAt) => nightlyDue(now, lastSuiteAt, SUITE_HOUR_UTC);

export function rerunSuite({ now, last, mainHead, running }) {
  if (running || !last || last.conclusion !== 'failure') return false;

  return last.headSha !== mainHead && now - Date.parse(last.createdAt) > HOUR_MS;
}

export function retryRelease({ now, lastReleaseAt, lastNightlyAt }) {
  if (now < lastDue(now, NIGHTLY_HOUR_UTC) || nightlyDue(now, lastNightlyAt)) return false;

  const releasedToday = lastReleaseAt && new Date(lastReleaseAt) >= dayOf(now);

  return !releasedToday && now - Date.parse(lastNightlyAt) > 2 * HOUR_MS;
}
