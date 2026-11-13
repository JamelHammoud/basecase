import { isLoopPull, isLoopReview, kindOf } from './evidence.mjs';
import { countBy } from './logs.mjs';
import { median } from './stats.mjs';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const round = (value, places = 1) => (value === null ? null : Number(value.toFixed(places)));

export const percentile = (values, share) => {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)];
};

const spread = (values) => ({
  count: values.length,
  median: round(median(values)),
  p90: round(percentile(values, 0.9)),
  max: round(values.length > 0 ? Math.max(...values) : null),
});

const ranJob = (job) => job.conclusion !== 'skipped' && job.started_at && job.created_at;

export const jobWaits = (jobs) =>
  jobs.filter(ranJob).map((job) => Math.max(0, Date.parse(job.started_at) - Date.parse(job.created_at)) / MINUTE_MS);

export function queueTimes({ sampled, queued, now }) {
  const firstStart = sampled.map((s) => jobWaits(s.jobs)).filter((waits) => waits.length > 0);

  return {
    firstJob: spread(firstStart.map((waits) => Math.min(...waits))),
    anyJob: spread(firstStart.flat()),
    waitingNow: queued.length,
    oldestWaitingMinutes: round(
      queued.length > 0 ? Math.max(...queued.map((r) => (now - Date.parse(r.createdAt)) / MINUTE_MS)) : null,
    ),
  };
}

export function checkRuns(runs) {
  const byEvent = Map.groupBy(runs, (r) => r.event);

  return [...byEvent].map(([event, list]) => ({
    event,
    runs: list.length,
    byConclusion: countBy(list.map((r) => r.conclusion || r.status)),
  }));
}

const hoursBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / HOUR_MS;

export function mergeTimesByKind(pulls) {
  const merged = pulls.filter((p) => p.mergedAt);
  const byKind = Map.groupBy(merged, kindOf);

  return [...byKind]
    .map(([kind, list]) => ({ kind, ...spread(list.map((p) => hoursBetween(p.createdAt, p.mergedAt))) }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

export function pullSizes(pulls) {
  const merged = pulls.filter((p) => p.mergedAt && typeof p.additions === 'number');
  const lines = merged.map((p) => p.additions + p.deletions);

  return { ...spread(lines), underTwentyLines: lines.filter((n) => n < 20).length };
}

const BLOCKER = /^- \*\*blocker\*\*(.*)$/gm;

const BLOCKER_TYPES = [
  ['protected path without a reason', /protected path/i],
  [
    'claims something that does not exist',
    /(doesn't|does not|don't) exist|there is no|isn't in|no such|documents things/i,
  ],
  ['no entry point or e2e test', /\be2e\b|entry point/i],
  ['weakened test', /\bskip|weaken|loosen|raised timeout|\.only/i],
  ['copy', /\bcopy\b|§3d|string|title case|banned word/i],
  ['changelog or help article', /changelog|help article/i],
  ['security', /inject|sandbox|keychain|untrusted|hallucinat|credential/i],
];

export const blockerType = (text) => BLOCKER_TYPES.find(([, pattern]) => pattern.test(text))?.[0] ?? 'code bug';

export function blockerFindings(comments, owner) {
  return comments
    .filter((c) => isLoopReview(c, owner))
    .flatMap((c) => [...c.body.matchAll(BLOCKER)].map((match) => ({ number: c.number, text: match[1].trim() })));
}

export const blockerTypes = (findings) => countBy(findings.map((f) => blockerType(f.text)));

export const verdicts = (comments, owner) =>
  countBy(
    comments
      .filter((c) => isLoopReview(c, owner))
      .map((c) => (c.body.trimStart().startsWith('### Review: pass') ? 'pass' : 'changes needed')),
  );

export const closedUnmerged = (pulls, owner) =>
  pulls.filter((p) => p.state === 'CLOSED' && !p.mergedAt && isLoopPull(p, owner));

const STOP = new Set([
  'a',
  'an',
  'and',
  'the',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'so',
  'it',
  'its',
  'is',
  'as',
  'by',
]);

export const titleWords = (title) =>
  new Set(
    title
      .toLowerCase()
      .replace(/^[a-z]+: /, '')
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 1 && !STOP.has(word)),
  );

export function similarity(a, b) {
  const left = titleWords(a);
  const right = titleWords(b);
  const shared = [...left].filter((word) => right.has(word)).length;
  const all = new Set([...left, ...right]).size;

  return all === 0 ? 0 : shared / all;
}

export function nearDuplicates(items, threshold = 0.6) {
  const pairs = [];

  for (const [i, a] of items.entries()) {
    for (const b of items.slice(i + 1)) {
      const score = similarity(a.title, b.title);

      if (score >= threshold)
        pairs.push({ a: a.number, b: b.number, title: a.title, other: b.title, score: round(score, 2) });
    }
  }

  return pairs.sort((x, y) => y.score - x.score);
}

const DECLINE = /^#(\d+) not built: /;

export const declinesByStep = (entries) =>
  countBy(
    entries
      .map((e) => DECLINE.exec(e.message)?.[1])
      .filter(Boolean)
      .map(Number),
  );

export function waitingSteps({ steps, declines, now }) {
  const declined = new Map(declines);

  return steps
    .map((s) => ({
      number: s.number,
      title: s.title,
      hours: round((now - Date.parse(s.createdAt)) / HOUR_MS),
      building: (s.labels ?? []).some((label) => label.name === 'loop:building'),
      declines: declined.get(s.number) ?? 0,
    }))
    .sort((a, b) => b.hours - a.hours);
}
