import { runFromCache } from '../../../bench/compare/cache.mjs';
import { MIN_TASKS_TO_SETTLE } from '../../../bench/compare/plan.mjs';
import { compareStats } from '../../../bench/compare/stats.mjs';

export const LABELS = ['branch', 'main'];
export const MARGIN = 0.1;
export const MIN_HELDOUT_TASKS = 3;

const latest = (byTask, ids, seeds) =>
  [...byTask.entries()].filter(([task]) => ids.includes(task)).flatMap(([, runs]) => runs.slice(-seeds));

export function measure({ main, branch, ids, seeds }) {
  return compareStats(
    [
      ...latest(branch, ids, seeds).map((entry) => runFromCache(entry, 'branch')),
      ...latest(main, ids, seeds).map((entry) => runFromCache(entry, 'main')),
    ],
    LABELS,
  );
}

const points = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value * 100))}`;

const gapText = (stats) =>
  stats.ci
    ? `${points(stats.meanDiff)} points (95% interval ${points(stats.ci[0])} to ${points(stats.ci[1])})`
    : 'none';

const tuneVerdict = (tune) => {
  if (!tune || tune.paired.length < MIN_TASKS_TO_SETTLE)
    return { verdict: 'discard', reason: `only ${tune?.paired.length ?? 0} tune tasks were graded on both harnesses` };

  if (!tune.ci || tune.ci[0] <= 0)
    return { verdict: 'discard', reason: `tune didn't clearly improve: gap ${gapText(tune)}` };

  return null;
};

const holds = (heldout, margin) => heldout.meanDiff >= 0 || (heldout.ci !== null && heldout.ci[0] >= -margin);

export function decide({ tune, heldout, margin = MARGIN }) {
  const failed = tuneVerdict(tune);

  if (failed) return failed;

  if (!heldout) return { verdict: 'confirm', reason: `tune improved: gap ${gapText(tune)}` };

  if (heldout.paired.length < MIN_HELDOUT_TASKS)
    return { verdict: 'discard', reason: `only ${heldout.paired.length} held-out tasks were graded on both harnesses` };

  if (!holds(heldout, margin)) return { verdict: 'discard', reason: `held out regressed: gap ${gapText(heldout)}` };

  return { verdict: 'keep', reason: `tune improved by ${gapText(tune)}; held out ${gapText(heldout)}` };
}

const pct = (value) => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`);

const row = (name, stats) => {
  const [branch, main] = stats.models;
  const interval = stats.ci ? `${points(stats.ci[0])} to ${points(stats.ci[1])}` : '—';
  const gap = stats.meanDiff === null ? '—' : points(stats.meanDiff);

  return `| ${name} | ${stats.paired.length} | ${pct(main.meanPassRate)} | ${pct(branch.meanPassRate)} | ${gap} | ${interval} | ${stats.wins} / ${stats.losses} / ${stats.ties} | ${stats.signP ?? '—'} |`;
};

export function measuredMarkdown({ tune, heldout, settings, harness, runs }) {
  return [
    '| Set | Tasks | `main` | This branch | Gap, points | 95% interval | Better / worse / same | Sign test p |',
    '|---|---|---|---|---|---|---|---|',
    row('Tune', tune),
    heldout ? row('Held out', heldout) : '| Held out | — | — | — | — | — | — | — |',
    '',
    `Mean pass rate per task, ${settings.seeds} seeds each, answered by \`${settings.served}\` at effort ${settings.effort}. Harness \`${harness.main}\` on \`main\`, \`${harness.branch}\` here. Interval: bootstrap over tasks (\`bench/compare/stats.mjs\`).`,
    '',
    `Runs (\`bench/runs/index.jsonl\`): ${runs.map((name) => `\`${name}\``).join(', ')}.`,
  ].join('\n');
}

export function lessonFields({ weakness, change, decision, runs }) {
  return {
    title: `${change.title} didn't help ${weakness.category}`,
    lesson: [
      `Weakness: ${weakness.category} micro-evals, ${Math.round(weakness.rate * 100)}% of tune runs passing on main.`,
      `Tried: ${change.summary}`,
      `Not kept: ${decision.reason}.`,
      "Don't retry this change as it was; a new attempt at this weakness needs a different cause or fix.",
    ].join(' '),
    evidence: runs,
    tags: ['harness', weakness.category],
  };
}
