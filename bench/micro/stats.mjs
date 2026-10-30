function choose(n, k) {
  if (k < 0 || k > n) return 0;

  let r = 1;

  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;

  return r;
}

export const passHatK = (n, c, k) => (n >= k ? choose(c, k) / choose(n, k) : null);

const round = (v, d = 3) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function taskStats(results) {
  const graded = results.filter((r) => r.status === 'pass' || r.status === 'fail');
  const n = graded.length;
  const c = graded.filter((r) => r.status === 'pass').length;
  const costs = results.map((r) => r.costUsd).filter((v) => typeof v === 'number');
  const times = results.map((r) => r.seconds).filter((v) => typeof v === 'number');

  return {
    runs: results.length,
    graded: n,
    passes: c,
    unavailable: results.filter((r) => r.status === 'unavailable').length,
    errors: results.filter((r) => r.status === 'error').length,
    passRate: n ? round(c / n) : null,
    passK: Object.fromEntries([1, 2, 3, 4, 5].filter((k) => k <= n).map((k) => [k, round(passHatK(n, c, k))])),
    meanCostUsd: round(mean(costs), 4),
    meanSeconds: round(mean(times), 0),
  };
}

function splitStats(rows) {
  const rates = rows.map((r) => r.stats.passRate).filter((v) => v !== null);
  const ks = [1, 2, 3, 4, 5];
  const passK = Object.fromEntries(
    ks
      .map((k) => [k, rows.map((r) => r.stats.passK[k]).filter((v) => v !== undefined && v !== null)])
      .filter(([, vs]) => vs.length)
      .map(([k, vs]) => [k, round(mean(vs))]),
  );

  return {
    tasks: rows.length,
    gradedTasks: rates.length,
    meanPassRate: round(mean(rates)),
    passK,
    costUsd: round(
      rows.reduce((s, r) => s + (r.stats.meanCostUsd ?? 0) * r.stats.runs, 0),
      2,
    ),
    seconds: Math.round(rows.reduce((s, r) => s + (r.stats.meanSeconds ?? 0) * r.stats.runs, 0)),
  };
}

export function suiteStats(results) {
  const byTask = new Map();

  for (const r of results) {
    if (!byTask.has(r.task))
      byTask.set(r.task, { task: r.task, category: r.category, heldOut: !!r.heldOut, results: [] });

    byTask.get(r.task).results.push(r);
  }

  const rows = [...byTask.values()].map((t) => ({ ...t, stats: taskStats(t.results) }));

  return {
    rows,
    tune: splitStats(rows.filter((r) => !r.heldOut)),
    heldOut: splitStats(rows.filter((r) => r.heldOut)),
    all: splitStats(rows),
  };
}

const cell = (v) => (v === null || v === undefined ? '—' : v);

export function statsMarkdown(stats) {
  const head = ['task', 'category', 'held out', 'runs', 'pass rate', 'pass^1', 'pass^3', 'unavailable', 'cost', 'time'];
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];

  for (const r of stats.rows) {
    const s = r.stats;

    lines.push(
      `| ${[
        r.task,
        r.category,
        r.heldOut ? 'yes' : '',
        s.runs,
        cell(s.passRate),
        cell(s.passK[1]),
        cell(s.passK[3]),
        s.unavailable,
        s.meanCostUsd !== null ? `$${s.meanCostUsd}` : '—',
        s.meanSeconds !== null ? `${Math.round(s.meanSeconds / 60)}m` : '—',
      ].join(' | ')} |`,
    );
  }

  for (const [name, s] of [
    ['Tune set', stats.tune],
    ['Held out', stats.heldOut],
  ])
    lines.push(
      '',
      `${name}: ${s.gradedTasks} of ${s.tasks} tasks graded, mean pass rate ${cell(s.meanPassRate)}, pass^k ${JSON.stringify(s.passK)}, $${s.costUsd}, ${Math.round(s.seconds / 60)} min`,
    );

  return lines.join('\n');
}
