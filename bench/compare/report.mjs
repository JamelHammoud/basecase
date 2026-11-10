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

export function compareMarkdown({ stats, models, labels, effort, plan, git, stopped }) {
  const [a, b] = labels;
  const ci = stats.ci ? `${signed(stats.ci[0])} to ${signed(stats.ci[1])}` : '—';

  return [
    `# ${a} vs ${b}`,
    '',
    `Commit ${git.commit ?? '—'}${git.dirty ? ' (uncommitted changes)' : ''}, effort ${effort ?? 'agent default'}, ${plan.done} of ${plan.total} pairs run${stopped ? ` (stopped at the $${plan.budget} budget)` : ''}.`,
    `Asked for ${models.map((m) => `${m.arg} (agent option “${m.id}”)`).join(' and ')}.`,
    '',
    `**${verdict(stats, labels)}**`,
    '',
    `Gap in pass rate (${a} − ${b}): ${signed(stats.meanDiff)}, 95% interval ${ci}. ${a} better on ${stats.wins} tasks, ${b} on ${stats.losses}, tied on ${stats.ties} (sign test p = ${cell(stats.signP)}).`,
    '',
    ...modelTable(stats),
    '',
    ...taskTable(stats, labels),
  ].join('\n');
}
