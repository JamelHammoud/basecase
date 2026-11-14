const graded = (r) => r.status === 'pass' || r.status === 'fail';
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const round = (v, d = 3) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);
const numbers = (xs) => xs.filter((v) => typeof v === 'number' && Number.isFinite(v));

function rng(seed) {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;

    let t = a;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapCI(values, { resamples = 4000, seed = 7, level = 0.95 } = {}) {
  if (values.length < 2) return null;

  const next = rng(seed);
  const means = Array.from({ length: resamples }, () =>
    mean(Array.from({ length: values.length }, () => values[Math.floor(next() * values.length)])),
  ).sort((a, b) => a - b);
  const tail = (1 - level) / 2;

  return [means[Math.floor(resamples * tail)], means[Math.ceil(resamples * (1 - tail)) - 1]];
}

function choose(n, k) {
  let r = 1;

  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;

  return r;
}

export function signTestP(wins, losses) {
  const n = wins + losses;

  if (!n) return null;

  const tail = sum(Array.from({ length: Math.min(wins, losses) + 1 }, (_, k) => choose(n, k))) / 2 ** n;

  return Math.min(1, 2 * tail);
}

const passRate = (runs) => {
  const g = runs.filter(graded);

  return g.length ? g.filter((r) => r.status === 'pass').length / g.length : null;
};

function modelSummary(model, runs, tasks) {
  const rates = numbers(tasks.map((t) => passRate(runs.filter((r) => r.task === t))));
  const costs = numbers(runs.map((r) => r.costUsd));
  const passes = runs.filter((r) => r.status === 'pass').length;

  return {
    model,
    runs: runs.length,
    graded: runs.filter(graded).length,
    errors: runs.filter((r) => r.status === 'error').length,
    unavailable: runs.filter((r) => r.status === 'unavailable').length,
    meanPassRate: round(mean(rates)),
    costUsd: round(sum(costs), 2),
    spentUsd: round(sum(numbers(runs.filter((r) => !r.cached).map((r) => r.costUsd))), 2),
    reused: runs.filter((r) => r.cached).length,
    passes,
    costPerRun: round(mean(costs), 3),
    passesPerDollar: sum(costs) ? round(passes / sum(costs), 2) : null,
    meanSeconds: round(mean(numbers(runs.map((r) => r.seconds))), 0),
    meanTokens: round(mean(numbers(runs.map((r) => r.tokens?.total))), 0),
    servedBy: [...new Set(runs.map((r) => r.servedBy).filter(Boolean))],
  };
}

export function pairedTasks(results, [a, b]) {
  const tasks = [...new Set(results.map((r) => r.task))];

  return tasks
    .map((task) => {
      const rateOf = (m) => passRate(results.filter((r) => r.task === task && r.model === m));

      return { task, a: rateOf(a), b: rateOf(b) };
    })
    .filter((t) => t.a !== null && t.b !== null)
    .map((t) => ({ ...t, diff: t.a - t.b }));
}

export function compareStats(results, models) {
  const tasks = [...new Set(results.map((r) => r.task))];
  const paired = pairedTasks(results, models);
  const diffs = paired.map((t) => t.diff);
  const wins = paired.filter((t) => t.diff > 0).length;
  const losses = paired.filter((t) => t.diff < 0).length;
  const ci = bootstrapCI(diffs);
  const stopCi = bootstrapCI(diffs, { level: 0.99 });

  return {
    models: models.map((m) =>
      modelSummary(
        m,
        results.filter((r) => r.model === m),
        tasks,
      ),
    ),
    paired,
    meanDiff: round(mean(diffs)),
    ci: ci && ci.map((v) => round(v)),
    stopCi: stopCi && stopCi.map((v) => round(v)),
    wins,
    losses,
    ties: paired.length - wins - losses,
    signP: round(signTestP(wins, losses)),
  };
}

export function verdict(stats, [a, b], { margin = 0.1 } = {}) {
  if (stats.paired.length < 3) return 'Too few tasks graded for both models to say anything.';

  const [lo, hi] = stats.ci ?? [null, null];

  if (lo !== null && lo > 0) return `${a} passes more tasks than ${b}.`;

  if (hi !== null && hi < 0) return `${b} passes more tasks than ${a}.`;

  if (lo !== null && lo >= -margin && hi <= margin)
    return `No practical difference: the gap is within ±${Math.round(margin * 100)} points of pass rate.`;

  return `No clear difference: the 95% interval on the gap includes zero. More seeds or tasks would narrow it.`;
}
