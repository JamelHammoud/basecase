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
  if (running || !last || last.conclusion === 'success') return false;

  return last.headSha !== mainHead && now - Date.parse(last.createdAt) > HOUR_MS;
}

export function releaseDue({ now, lastReleaseAt, lastAttemptAt, running }) {
  const due = new Date(now);

  due.setUTCHours(NIGHTLY_HOUR_UTC, GRACE_MINUTES, 0, 0);

  if (running || now < due) return false;

  if (lastReleaseAt && new Date(lastReleaseAt) >= dayOf(due)) return false;

  return !lastAttemptAt || now - Date.parse(lastAttemptAt) > 2 * HOUR_MS;
}

export function nextVersion(tag) {
  const [major, minor, patch] = String(tag).replace(/^v/, '').split('.').map(Number);

  return `${major}.${minor}.${patch + 1}`;
}
