const HOUR = 60 * 60_000;
const MIN_OBSERVATION = HOUR / 2;
const FRESH = 5 * 60_000;
const WEEK_MINUTES = 10080;

function pointFor(snapshot, window) {
  const found = snapshot?.windows?.find(
    (item) => item.minutes === WEEK_MINUTES && item.bucket === window.bucket && item.reset === window.reset,
  );

  return Number.isFinite(snapshot?.at) && Number.isFinite(found?.used) && found.used >= 0 && found.used <= 100
    ? { at: snapshot.at, used: found.used }
    : null;
}

function recentPoints({ current, samples, window }) {
  const points = [...samples, current]
    .map((snapshot) => pointFor(snapshot, window))
    .filter((point) => point && point.at >= current.at - HOUR && point.at <= current.at)
    .sort((a, b) => a.at - b.at);
  const restart = points.findLastIndex((point, index) => index > 0 && point.used < points[index - 1].used);

  return points.slice(Math.max(0, restart));
}

const assessment = ({ minimum, maximum, allowed }) => {
  if (minimum > allowed) return 'over';

  return maximum <= allowed ? 'within' : 'uncertain';
};

function windowBurn({ current, samples, window, now, target }) {
  const base = { bucket: window.bucket, reset: window.reset, scope: 'account' };

  if (
    !Number.isFinite(current.at) ||
    !Number.isFinite(window.used) ||
    !Number.isFinite(window.reset) ||
    window.used < 0 ||
    window.used > 100
  )
    return { ...base, status: 'unavailable' };

  if (now - current.at > FRESH || window.reset <= now) return { ...base, status: 'stale' };

  const [first] = recentPoints({ current, samples, window });
  const elapsed = first ? current.at - first.at : 0;

  if (elapsed < MIN_OBSERVATION) return { ...base, status: 'insufficient-data' };

  const hours = elapsed / HOUR;
  const delta = window.used - first.used;
  const minimum = Math.max(0, delta - 1) / hours;
  const maximum = (delta + 1) / hours;
  const allowed = Math.max(0, target - window.used) / ((window.reset - now) / HOUR);

  return {
    ...base,
    status: assessment({ minimum, maximum, allowed }),
    minutes: elapsed / 60_000,
    pointsUsed: delta,
    pointsPerHour: delta / hours,
    roundingRange: { minimum, maximum },
    remainingBudgetPerHour: allowed,
  };
}

export const accountBurn = ({ current, samples, now = Date.now(), target = 90 }) =>
  (current?.windows ?? [])
    .filter((window) => window.minutes === WEEK_MINUTES)
    .map((window) => windowBurn({ current, samples, window, now, target }));
