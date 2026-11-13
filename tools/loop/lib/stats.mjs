import { isLoopReview, isRevert, kindOf, parseReview } from './evidence.mjs';

const HOUR_MS = 60 * 60 * 1000;

export const median = (values) => {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export const mergedIn = (pulls, { from, to }) =>
  pulls.filter((p) => p.mergedAt && p.mergedAt >= from && p.mergedAt <= to);

export function countByKind(pulls) {
  const counts = new Map();

  for (const pull of pulls) counts.set(kindOf(pull), (counts.get(kindOf(pull)) ?? 0) + 1);

  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function reviewTotals(comments, owner) {
  const reviews = comments
    .filter((c) => isLoopReview(c, owner))
    .map((c) => parseReview(c.body))
    .filter(Boolean);
  const sum = (key) => reviews.reduce((total, review) => total + review[key], 0);

  return {
    passed: reviews.filter((r) => r.verdict === 'pass').length,
    failed: reviews.filter((r) => r.verdict === 'fail').length,
    blockers: sum('blockers'),
    minors: sum('minors'),
  };
}

export function redHours(runs, { from, to }) {
  const start = Date.parse(from);
  const end = Date.parse(to);
  const events = runs
    .filter((r) => r.status === 'completed' && ['success', 'failure'].includes(r.conclusion))
    .map((r) => ({ at: Date.parse(r.updatedAt), red: r.conclusion === 'failure' }))
    .filter((e) => e.at <= end)
    .sort((a, b) => a.at - b.at);
  let state = { red: false, at: start };
  let total = 0;

  for (const event of events) {
    const at = Math.max(event.at, start);

    if (state.red) total += at - state.at;

    state = { red: event.red, at };
  }

  if (state.red) total += end - state.at;

  return total / HOUR_MS;
}

export const hoursToMerge = (pulls) =>
  median(pulls.map((p) => (Date.parse(p.mergedAt) - Date.parse(p.createdAt)) / HOUR_MS));

export function weekStats({ pulls, comments, commits, runs, openSteps, owner, from, to }) {
  const merged = mergedIn(pulls, { from, to });
  const byKind = countByKind(merged);

  return {
    merged: merged.length,
    byKind: byKind.filter(([kind]) => kind !== 'lesson'),
    lessons: byKind.find(([kind]) => kind === 'lesson')?.[1] ?? 0,
    reviews: reviewTotals(
      comments.filter((c) => c.createdAt >= from && c.createdAt <= to),
      owner,
    ),
    reverts: commits.filter((c) => isRevert(c.message)).length,
    redHours: redHours(runs, { from, to }),
    openSteps,
    mergeHours: hoursToMerge(merged),
  };
}

const hours = (value) => (value === null ? 'None' : value.toFixed(1));

export const digestTitle = (from) => `Digest: week of ${from.slice(0, 10)}`;

export function digestTable(stats) {
  const rows = [
    ['Pull requests merged', stats.merged],
    ...stats.byKind.map(([kind, count]) => [`Merged: \`loop:${kind}\``, count]),
    ['Lessons merged', stats.lessons],
    ['Reviews passed', stats.reviews.passed],
    ['Reviews with changes needed', stats.reviews.failed],
    ['Blockers found', stats.reviews.blockers],
    ['Minor findings', stats.reviews.minors],
    ['Reverts on `main`', stats.reverts],
    ["Hours `main`'s Check was red", hours(stats.redHours)],
    ['Open `loop:next` steps', stats.openSteps],
    ['Median hours from opened to merged', hours(stats.mergeHours)],
  ];

  return ['| Measure | Week |', '|---|---:|', ...rows.map(([name, value]) => `| ${name} | ${value} |`)].join('\n');
}
