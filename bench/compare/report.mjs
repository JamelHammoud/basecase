import { verdict } from './stats.mjs';

const cell = (v) => (v === null || v === undefined ? '—' : v);
const money = (v) => (typeof v === 'number' ? `$${v.toFixed(2)}` : '—');
const signed = (v) => (typeof v === 'number' ? `${v > 0 ? '+' : ''}${v.toFixed(2)}` : '—');

function table(head, rows) {
  return [
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ];
}

function modelTable(stats) {
  return table(
    [
      'model',
      'answered by',
      'mean pass rate',
      'runs',
      'errors',
      'cost',
      'per run',
      'passes per $',
      'time per run',
      'tokens per run',
    ],
    stats.models.map((m) => [
      m.model,
      m.servedBy.join(', ') || '—',
      cell(m.meanPassRate),
      m.runs,
      m.errors,
      money(m.costUsd),
      money(m.costPerRun),
      cell(m.passesPerDollar),
      m.meanSeconds !== null ? `${Math.round(m.meanSeconds / 60)}m` : '—',
      m.meanTokens !== null ? `${Math.round(m.meanTokens / 1000)}K` : '—',
    ]),
  );
}

function taskTable(stats, [a, b]) {
  return table(
    ['task', a, b, 'gap'],
    stats.paired.map((t) => [
      t.task,
      cell(Math.round(t.a * 100) / 100),
      cell(Math.round(t.b * 100) / 100),
      signed(t.diff),
    ]),
  );
}

const STOPS = {
  winner: 'stopped early: the 99% interval excluded zero',
  equivalent: 'stopped early: the 99% interval sat inside the margin',
  budget: 'stopped at the budget',
  served: 'stopped: a different model answered',
  rounds: 'ran every round',
};

const commitOf = (git) => `${git?.commit ?? '—'}${git?.dirty ? ' (uncommitted changes)' : ''}`;

const harnessesText = ({ git, plan }) =>
  plan.arms
    ? `${plan.arms.map((arm) => `${arm.label} at commit ${commitOf(arm.git)}, harness ${arm.harness}`).join('; ')}.`
    : `Commit ${commitOf(git)}, harness ${plan.harness}.`;

function setupLine({ git, effort, plan }) {
  return `${harnessesText({ git, plan })} Effort ${effort ?? 'agent default'}. ${plan.rounds} of ${plan.maxRounds} rounds over ${plan.tasks} tasks, ${plan.parallel} at a time, ${STOPS[plan.stop] ?? plan.stop}.`;
}

const askedLine = (models, plan) =>
  plan.arms
    ? `Both harnesses ran ${models[0].arg} (agent option “${models[0].id}”).`
    : `Asked for ${models.map((m) => `${m.arg} (agent option “${m.id}”)`).join(' and ')}.`;

function spendLine(stats) {
  const spent = stats.models.reduce((s, m) => s + (m.spentUsd ?? 0), 0);
  const reused = stats.models.filter((m) => m.reused).map((m) => `${m.reused} ${m.model} runs`);

  return `Spent ${money(spent)}${reused.length ? `; reused ${reused.join(' and ')} from earlier runs on the same harness` : ''}.`;
}

export function compareMarkdown({ stats, models, labels, effort, plan, git }) {
  const [a, b] = labels;
  const ci = stats.ci ? `${signed(stats.ci[0])} to ${signed(stats.ci[1])}` : '—';

  return [
    `# ${a} vs ${b}`,
    '',
    setupLine({ git, effort, plan }),
    `${askedLine(models, plan)} ${spendLine(stats)}`,
    '',
    `**${verdict(stats, labels, { margin: plan.margin })}**`,
    '',
    `Gap in pass rate (${a} − ${b}): ${signed(stats.meanDiff)}, 95% interval ${ci}. ${a} better on ${stats.wins} tasks, ${b} on ${stats.losses}, tied on ${stats.ties} (sign test p = ${cell(stats.signP)}).`,
    '',
    ...modelTable(stats),
    '',
    ...taskTable(stats, labels),
  ].join('\n');
}
