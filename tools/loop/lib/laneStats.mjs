import { copyNetOf } from './copy.mjs';
import { isLoopReview, kindOf, membersOf, parseReview } from './evidence.mjs';

const HOUR_MS = 60 * 60 * 1000;

export const LANE_ORDER = ['build', 'refine', 'rebuild', 'repair', 'learn', 'market', 'update', 'lead'];

export const MEASURES = [
  { key: 'mergeHours', name: 'Median hours from step opened to merged', better: 'lower' },
  { key: 'revisions', name: 'Review rounds before pass, per pull request', better: 'lower' },
  { key: 'repairs', name: 'Repairs per merge', better: 'lower' },
  { key: 'copyNet', name: 'Copy net (strings added minus removed)', better: 'lower' },
  { key: 'steps', name: 'Steps closed per step opened', better: 'higher' },
];

const STEP_LABELS = new Set(['loop:next', 'loop:building', 'loop:feature', 'loop:integration', 'loop:refine']);
const BRANCH_LANE = /^loop\/([a-z]+)\//;
const REPAIR_SHA = /^loop\/repair\/main-([0-9a-f]{7,40})/;
const MERGED_PULL = /^Merge pull request #(\d+)|\(#(\d+)\)$/m;
const CLOSES = /^Closes #(\d+)\b/m;

export const round = (value) => (value === null ? null : Math.round(value * 100) / 100);

export const median = (values) => {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const mean = (values) => (values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length);

const inWindow = (at, { from, to }) => Boolean(at) && at >= from && at <= to;

export const laneOf = (pull) => BRANCH_LANE.exec(pull.headRefName ?? '')?.[1] ?? kindOf(pull);

export const stepOf = (pull) => Number(CLOSES.exec(pull.body ?? '')?.[1]) || null;

export const isStepIssue = (issue) => (issue.labels ?? []).some((label) => STEP_LABELS.has(label.name));

export function revisionsOf(comments, owner) {
  const verdicts = comments
    .filter((c) => isLoopReview(c, owner))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((c) => parseReview(c.body)?.verdict);
  const pass = verdicts.indexOf('pass');

  return (pass === -1 ? verdicts : verdicts.slice(0, pass)).filter((v) => v === 'fail').length;
}

const mergedPullOf = (sha, commits) => {
  const match = MERGED_PULL.exec(commits.find((c) => c.sha.startsWith(sha))?.message ?? '');

  return match ? Number(match[1] ?? match[2]) : null;
};

const shareOut = (pull, byNumber) => {
  if (laneOf(pull) !== 'batch') return [[laneOf(pull), 1]];

  const members = membersOf(pull.body)
    .map((n) => byNumber.get(n))
    .filter(Boolean);

  return members.map((member) => [laneOf(member), 1 / members.length]);
};

export function tracedRepairs({ pulls, commits, window }) {
  const byNumber = new Map(pulls.map((p) => [p.number, p]));
  const shares = new Map();
  const repairs = pulls.filter((p) => REPAIR_SHA.test(p.headRefName ?? '') && inWindow(p.createdAt, window));

  for (const repair of repairs) {
    const broke = byNumber.get(mergedPullOf(REPAIR_SHA.exec(repair.headRefName)[1], commits));

    for (const [lane, share] of broke ? shareOut(broke, byNumber) : []) {
      shares.set(lane, (shares.get(lane) ?? 0) + share);
    }
  }

  return shares;
}

const groupBy = (items, key) => {
  const groups = new Map();

  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);

  return groups;
};

function pullMeasures(pulls, { byPull, stepOpened, owner }) {
  const commentsOf = (pull) => byPull.get(pull.number) ?? [];
  const opened = (pull) => stepOpened.get(stepOf(pull)) ?? pull.createdAt;
  const nets = pulls.map((pull) => copyNetOf(commentsOf(pull))).filter((net) => net !== null);

  return {
    merged: pulls.length,
    mergeHours: round(median(pulls.map((p) => (Date.parse(p.mergedAt) - Date.parse(opened(p))) / HOUR_MS))),
    revisions: round(mean(pulls.map((pull) => revisionsOf(commentsOf(pull), owner)))),
    copyNet: nets.length === 0 ? null : nets.reduce((sum, net) => sum + net, 0),
  };
}

function stepMeasures(steps, window) {
  const opened = steps.filter((s) => inWindow(s.createdAt, window)).length;
  const closed = steps.filter((s) => inWindow(s.closedAt, window) && s.stateReason !== 'NOT_PLANNED').length;

  return { steps: opened === 0 ? null : round(closed / opened), stepsOpened: opened, stepsClosed: closed };
}

export function laneStats({ pulls, comments, commits, steps, owner, from, to }) {
  const window = { from, to };
  const stepIssues = steps.filter(isStepIssue);
  const context = {
    byPull: groupBy(comments, (c) => c.number),
    stepOpened: new Map(stepIssues.map((s) => [s.number, s.createdAt])),
    owner,
  };
  const merged = pulls.filter((p) => inWindow(p.mergedAt, window) && !['batch', 'other'].includes(laneOf(p)));
  const repairs = tracedRepairs({ pulls, commits, window });
  const lanes = {};

  for (const [lane, lanePulls] of groupBy(merged, laneOf)) {
    const measures = pullMeasures(lanePulls, context);

    lanes[lane] = { ...measures, repairs: round((repairs.get(lane) ?? 0) / measures.merged) };
  }

  const lead = stepMeasures(stepIssues, window);

  if (lead.stepsOpened + lead.stepsClosed > 0) lanes.lead = { ...lanes.lead, ...lead };

  return lanes;
}

const rank = (lane) => (LANE_ORDER.includes(lane) ? LANE_ORDER.indexOf(lane) : LANE_ORDER.length);

export const laneNamesIn = (...groups) =>
  [...new Set(groups.flatMap((lanes) => Object.keys(lanes ?? {})))].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  );

const worsening = (measure, value, last) =>
  (measure.better === 'lower' ? value - last : last - value) / Math.max(Math.abs(last), 1);

export function worstChange(lanes, last) {
  if (!last) return null;

  let worst = null;

  for (const lane of laneNamesIn(lanes, last)) {
    for (const measure of MEASURES) {
      const value = lanes[lane]?.[measure.key] ?? null;
      const before = last[lane]?.[measure.key] ?? null;
      const score = value === null || before === null ? 0 : worsening(measure, value, before);

      if (score > (worst?.score ?? 0))
        worst = { lane, measure: measure.key, name: measure.name, last: before, value, score };
    }
  }

  return worst && { ...worst, score: round(worst.score) };
}
