import { median } from './stats.mjs';

const ENTRY = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z) \[([a-z]+)(?:-(\d+))?\] (.*)$/;
const TOOK = /^took (\d+) min$/;
const MINUTE_MS = 60 * 1000;
const SHORT_RUN_MS = 2 * MINUTE_MS;

const OUTCOMES = [
  ['crash', /^failed: /],
  ['session failed', /session failed: /],
  ['waiting', /^(?:main is red; waiting|a repair merged after the last failed Check; waiting)/],
  [
    'declined',
    /not built: |^no change: |^no lesson: |nothing to change: |rebuilt as nothing|conflicts left unresolved/,
  ],
  [
    'idle',
    /^(no step waiting|no conflicts|no reason to plan|no Check on main|nothing |main is green|this week's .* is out|the agent adapters are current|\d+ ideas wait|#\d+ is already open|a repair pull request is already open|paused \(LOOP_PAUSED\)|last retro|no doc change|#\d+: review of \w+ carried over)/,
  ],
];

export const outcomeOf = (message) => {
  if (TOOK.test(message)) return 'took';

  return OUTCOMES.find(([, pattern]) => pattern.test(message))?.[0] ?? 'worked';
};

export function parseLog(text) {
  const entries = [];

  for (const line of text.split('\n')) {
    const match = ENTRY.exec(line);

    if (match) {
      const [, at, lane, slot = '1', message] = match;

      entries.push({ at, lane, slot: `${lane}-${slot}`, message, outcome: outcomeOf(message) });
    } else if (line.trim() && entries.length > 0) entries.at(-1).message += `\n${line}`;
  }

  return entries;
}

export const errorKey = (message) =>
  message
    .split('\n')[0]
    .replace(/^failed: /, '')
    .replace(/'[^']*'|"[^"]*"/g, '…')
    .replace(/loop\/[\w/.-]+/g, 'loop/…')
    .replace(/#?\d+/g, 'N')
    .slice(0, 140);

export function countBy(values) {
  const counts = new Map();

  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

  return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

const busy = (entry) => ['worked', 'declined', 'session failed', 'crash'].includes(entry.outcome);

export function runMinutes(entries) {
  const took = entries.filter((e) => e.outcome === 'took').map((e) => Number(TOOK.exec(e.message)[1]));

  if (took.length > 0) return took;

  const lastAt = new Map();
  const minutes = [];

  for (const entry of entries) {
    const at = Date.parse(entry.at);
    const before = lastAt.get(entry.slot);

    lastAt.set(entry.slot, at);

    if (before !== undefined && busy(entry) && at - before > SHORT_RUN_MS) minutes.push((at - before) / MINUTE_MS);
  }

  return minutes;
}

const ratio = (part, whole) => (whole === 0 ? 0 : part / whole);

export function laneHealth(entries) {
  const runs = entries.filter((e) => e.outcome !== 'took');
  const count = (outcome) => runs.filter((e) => e.outcome === outcome).length;
  const minutes = runMinutes(entries);
  const crashes = count('crash');

  return {
    runs: runs.length,
    worked: count('worked'),
    declined: count('declined'),
    idle: count('idle'),
    waiting: count('waiting'),
    crashes,
    sessionFailures: count('session failed'),
    crashRate: ratio(crashes + count('session failed'), runs.length),
    idleRatio: ratio(count('idle') + count('waiting'), runs.length),
    medianMinutes: median(minutes),
    maxMinutes: minutes.length > 0 ? Math.max(...minutes) : null,
    errors: countBy(
      runs.filter((e) => e.outcome === 'crash' || e.outcome === 'session failed').map((e) => errorKey(e.message)),
    ),
  };
}

export const inWindow = (entries, { from, to }) => entries.filter((e) => e.at >= from && e.at <= to);

export function lanesHealth(entries) {
  const byLane = Map.groupBy(entries, (e) => e.lane);

  return [...byLane]
    .map(([lane, list]) => ({ lane, ...laneHealth(list) }))
    .sort((a, b) => b.crashRate - a.crashRate || a.lane.localeCompare(b.lane));
}
