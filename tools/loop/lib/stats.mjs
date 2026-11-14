import { isLoopReview, isRevert, kindOf, parseReview } from './evidence.mjs';
import { laneNamesIn, laneStats, MEASURES, median, round, worstChange } from './laneStats.mjs';
import { deltaText, lastMeasure } from './pullMeasure.mjs';

export { median } from './laneStats.mjs';

const HOUR_MS = 60 * 60 * 1000;

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

export function measuredPulls(merged, comments, owner) {
  return merged.flatMap((pull) => {
    const found = lastMeasure(
      comments.filter((c) => c.number === pull.number),
      owner,
    );

    return found && found.data.verdict !== 'skipped'
      ? [{ number: pull.number, title: pull.title, delta: deltaText(found.data) }]
      : [];
  });
}

export function weekStats({ pulls, comments, commits, runs, steps = [], openSteps, owner, from, to, previous = null }) {
  const merged = mergedIn(pulls, { from, to });
  const byKind = countByKind(merged);
  const lanes = laneStats({ pulls, comments, commits, steps, owner, from, to });

  return {
    from,
    to,
    merged: merged.length,
    byKind: byKind.filter(([kind]) => kind !== 'lesson'),
    lessons: byKind.find(([kind]) => kind === 'lesson')?.[1] ?? 0,
    reviews: reviewTotals(
      comments.filter((c) => c.createdAt >= from && c.createdAt <= to),
      owner,
    ),
    reverts: commits.filter((c) => isRevert(c.message) && (!c.date || (c.date >= from && c.date <= to))).length,
    redHours: redHours(runs, { from, to }),
    openSteps,
    mergeHours: hoursToMerge(merged),
    lanes,
    harness: measuredPulls(merged, comments, owner),
    lastLanes: previous?.lanes ?? null,
    worst: worstChange(lanes, previous?.lanes ?? null),
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

const DIGEST_BLOCK = /^```json digest\n([\s\S]*?)\n```$/m;

const shown = (value) => (value === null || value === undefined ? 'None' : String(round(value)));

const signed = (value) => (value > 0 ? `+${value}` : String(value));

const change = (value, last) => (value === null || last === null ? '' : signed(round(value - last)));

export function laneTable(lanes, last) {
  const head = last
    ? ['| Lane | Measure | This week | Last week | Change |', '|---|---|---:|---:|---:|']
    : ['| Lane | Measure | This week |', '|---|---|---:|'];
  const rows = laneNamesIn(lanes, last).flatMap((lane) =>
    MEASURES.map((measure) => ({
      measure,
      value: lanes[lane]?.[measure.key] ?? null,
      before: last?.[lane]?.[measure.key] ?? null,
    }))
      .filter(({ value, before }) => value !== null || before !== null)
      .map(({ measure, value, before }) => {
        const cells = [`\`${lane}\``, measure.name, shown(value)];

        return `| ${(last ? [...cells, shown(before), change(value, before)] : cells).join(' | ')} |`;
      }),
  );

  return [...head, ...rows].join('\n');
}

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

export const worstLine = (worst) =>
  worst
    ? `Worst change: \`${worst.lane}\` ${lowerFirst(worst.name)}, ${shown(worst.last)} last week and ${shown(worst.value)} this week.`
    : 'No lane got worse on any measure since last week.';

export const worstSection = (worst, ask) =>
  worst ? [`## The digest's worst number\n\n${worstLine(worst)}\n\n${ask}`] : [];

export const digestJson = (stats) =>
  [
    '```json digest',
    JSON.stringify({ from: stats.from, to: stats.to, lanes: stats.lanes, worst: stats.worst }),
    '```',
  ].join('\n');

export function parseDigest(body) {
  const block = DIGEST_BLOCK.exec(body ?? '');

  if (!block) return null;

  try {
    return JSON.parse(block[1]);
  } catch {
    return null;
  }
}

export const harnessSection = (harness) =>
  harness.length > 0
    ? [
        `Harness pull requests, measured on the micro-evals:\n\n${harness.map((p) => `- #${p.number} ${p.title}: ${p.delta}`).join('\n')}`,
      ]
    : [];

export const digestBody = (stats) =>
  [
    digestTable(stats),
    laneTable(stats.lanes, stats.lastLanes),
    ...harnessSection(stats.harness ?? []),
    ...(stats.lastLanes ? [worstLine(stats.worst)] : []),
    digestJson(stats),
  ].join('\n\n');
