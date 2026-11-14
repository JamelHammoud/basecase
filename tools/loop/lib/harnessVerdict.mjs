import { MIN_TASKS_TO_SETTLE } from '../../../bench/compare/plan.mjs';

export const MIN_HELDOUT_TASKS = 3;
export const COST_BAR = 0.2;
export const DEFAULT_BUDGET = 40;
export const PULL_BUDGET = 15;

export const budgetFrom = (value, fallback = DEFAULT_BUDGET) => (Number(value) > 0 ? Number(value) : fallback);

export function skipReason({ paused, pulls, now = Date.now() }) {
  if (paused && now < paused.until) return 'usage is paused';

  const open = pulls.find((pull) => pull.headRefName.startsWith('loop/harness/'));

  return open ? `#${open.number} is already open` : null;
}

export const points = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value * 100))}`;

export const gapText = (stats) =>
  stats.ci
    ? `${points(stats.meanDiff)} points (95% interval ${points(stats.ci[0])} to ${points(stats.ci[1])})`
    : 'none';

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

const perPass = (sets, side) => {
  const passes = sum(sets.map((set) => set.models[side].passes ?? 0));

  return passes ? sum(sets.map((set) => set.models[side].costUsd ?? 0)) / passes : Infinity;
};

export function costRise(sets) {
  const [branch, main] = [perPass(sets, 0), perPass(sets, 1)];

  if (main === Infinity) return branch === Infinity ? null : -1;

  return branch / main - 1;
}

const inconclusive = (set, paired) => ({
  verdict: 'inconclusive',
  reason: `only ${paired} ${set} tasks were graded on both harnesses`,
});

function heldoutVerdict({ tune, heldout, costBar }) {
  if (heldout.paired.length < MIN_HELDOUT_TASKS) return inconclusive('held-out', heldout.paired.length);

  if (!heldout.ci || heldout.ci[0] <= 0)
    return { verdict: 'discard', reason: `held out didn't clearly improve: gap ${gapText(heldout)}` };

  const rise = costRise([tune, heldout]);

  if (rise === null || rise >= costBar)
    return {
      verdict: 'discard',
      reason: `cost per pass rose ${rise === null ? 'without a pass' : `${Math.round(rise * 100)}%`}`,
    };

  return { verdict: 'keep', reason: `tune improved by ${gapText(tune)}; held out by ${gapText(heldout)}` };
}

export function decide({ tune, heldout, costBar = COST_BAR }) {
  if (!tune || tune.paired.length < MIN_TASKS_TO_SETTLE) return inconclusive('tune', tune?.paired.length ?? 0);

  if (!tune.ci || tune.ci[0] <= 0)
    return { verdict: 'discard', reason: `tune didn't clearly improve: gap ${gapText(tune)}` };

  if (!heldout) return { verdict: 'confirm', reason: `tune improved: gap ${gapText(tune)}` };

  return heldoutVerdict({ tune, heldout, costBar });
}

const riseText = (rise) => (rise === Infinity ? 'nothing passed here' : `${Math.round(rise * 100)}%`);

export function pullVerdict(stats, costBar = COST_BAR) {
  const paired = stats?.paired.length ?? 0;

  if (paired < MIN_TASKS_TO_SETTLE)
    return { verdict: 'inconclusive', reason: `only ${paired} tune tasks were graded on both harnesses` };

  if (stats.ci && stats.ci[1] < 0) return { verdict: 'worse', reason: `the tune set got worse: gap ${gapText(stats)}` };

  const rise = costRise([stats]);

  if (rise !== null && rise > costBar) return { verdict: 'worse', reason: `cost per pass rose ${riseText(rise)}` };

  return { verdict: 'no worse', reason: `gap ${gapText(stats)}` };
}

export function settleCost({ perRun, tasks, mainCached }) {
  if (!perRun || tasks === 0) return 0;

  return MIN_TASKS_TO_SETTLE * (2 - mainCached / tasks) * perRun;
}

export const confirmHeldout = ({ tune, heldout, costBar = COST_BAR }) =>
  heldout
    ? decide({ tune, heldout, costBar })
    : { verdict: 'inconclusive', reason: 'the held-out compare ended without results' };

const pct = (value) => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`);

const money = (value) => (Number.isFinite(value) ? `$${value.toFixed(2)}` : '—');

const row = (name, stats) => {
  const [branch, main] = stats.models;
  const interval = stats.ci ? `${points(stats.ci[0])} to ${points(stats.ci[1])}` : '—';
  const gap = stats.meanDiff === null ? '—' : points(stats.meanDiff);

  return `| ${name} | ${stats.paired.length} | ${pct(main.meanPassRate)} | ${pct(branch.meanPassRate)} | ${gap} | ${interval} | ${stats.wins} / ${stats.losses} / ${stats.ties} | ${stats.signP ?? '—'} |`;
};

const costLine = (sets) => {
  const rise = costRise(sets);
  const change = rise === null ? '' : ` (${rise >= 0 ? '+' : '−'}${Math.abs(Math.round(rise * 100))}%)`;

  return `Cost per pass: ${money(perPass(sets, 1))} on \`main\`, ${money(perPass(sets, 0))} here${change}.`;
};

const reportBlock = (name, measured) =>
  measured?.report
    ? `<details><summary>${name}: <code>report.md</code></summary>\n\n${measured.report.replace(/^# .*\n+/, '')}\n</details>`
    : '';

export function measuredMarkdown({ tune, heldout, settings, harness, runs }) {
  const sets = [tune, heldout].filter(Boolean).map((measured) => measured.stats);

  return [
    '| Set | Tasks | `main` | This branch | Gap, points | 95% interval | Better / worse / same | Sign test p |',
    '|---|---|---|---|---|---|---|---|',
    row('Tune', tune.stats),
    heldout ? row('Held out', heldout.stats) : '| Held out | — | — | — | — | — | — | — |',
    '',
    `Mean pass rate per task, up to ${settings.seeds} seeds each, answered by \`${settings.served}\` at effort ${settings.effort}. Harness \`${harness.main}\` on \`main\`, \`${harness.branch}\` here. ${costLine(sets)} Measured with \`bench/compare.mjs --against\`.`,
    '',
    `Runs (\`bench/runs/index.jsonl\`): ${runs.map((name) => `\`${name}\``).join(', ')}.`,
    '',
    reportBlock('Tune', tune),
    '',
    reportBlock('Held out', heldout),
  ]
    .join('\n')
    .trimEnd();
}

export function experimentFields({ weakness, change, decision, runs }) {
  return {
    title: change.title,
    lesson: [
      `Weakness: ${weakness.category} micro-evals, ${Math.round(weakness.rate * 100)}% of tune runs passing on main.`,
      `Change: ${change.summary}`,
      `${decision.verdict === 'keep' ? 'Kept' : 'Not kept'}: ${decision.reason}.`,
    ].join(' '),
    evidence: runs,
    tags: [weakness.category, decision.verdict === 'keep' ? 'kept' : 'not kept'],
  };
}
