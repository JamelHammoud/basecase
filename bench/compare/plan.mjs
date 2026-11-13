const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function roundJobs({ tasks, labels, seed }) {
  return tasks.flatMap((task, i) => {
    const order = (seed + i) % 2 ? [...labels].reverse() : [...labels];

    return order.map((label) => ({ task, seed, label }));
  });
}

export function canStart({ spent, inflight, perRun, budget }) {
  if (!Number.isFinite(budget)) return true;

  return spent + (inflight + 1) * (perRun ?? 0) <= budget;
}

export const MIN_TASKS_TO_SETTLE = 5;

export function settled(stats, { margin }) {
  if (stats.paired.length < MIN_TASKS_TO_SETTLE || !stats.stopCi) return null;

  const [lo, hi] = stats.stopCi;

  if (lo > 0 || hi < 0) return 'winner';

  if (lo >= -margin && hi <= margin) return 'equivalent';

  return null;
}

export function historicalRunCost(entries, taskIds) {
  const micro = entries.filter((e) => e.kind === 'micro' && typeof e.costUsd === 'number');
  const overall = mean(micro.map((e) => e.costUsd));

  if (overall === null) return null;

  const ofTask = (id) => mean(micro.filter((e) => e.task === id).map((e) => e.costUsd)) ?? overall;

  return mean(taskIds.map(ofTask));
}

export const liveRunsPlanned = ({ tasks, rounds, caches }) =>
  caches.map((byTask) => tasks.reduce((n, task) => n + Math.max(0, rounds - (byTask.get(task.id)?.length ?? 0)), 0));

export function splitSlots(parallel, [a, b]) {
  if (!a || !b) return [a ? parallel : 0, b ? parallel : 0];

  if (parallel < 2) return [1, 1];

  const first = Math.min(parallel - 1, Math.max(1, Math.round((parallel * a) / (a + b))));

  return [first, parallel - first];
}
