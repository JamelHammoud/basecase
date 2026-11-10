export function schedule({ tasks, models, seeds }) {
  const pairs = [];

  for (let seed = 1; seed <= seeds; seed++) {
    tasks.forEach((task, i) => {
      const order = (seed + i) % 2 ? [...models].reverse() : [...models];

      pairs.push({ task, seed, order });
    });
  }

  return pairs;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function nextPairFits({ spent, pairCosts, budget }) {
  if (!Number.isFinite(budget)) return true;

  return spent + (mean(pairCosts) ?? 0) <= budget;
}

export function historicalRunCost(entries, taskIds) {
  const micro = entries.filter((e) => e.kind === 'micro' && typeof e.costUsd === 'number');
  const overall = mean(micro.map((e) => e.costUsd));

  if (overall === null) return null;

  const ofTask = (id) => mean(micro.filter((e) => e.task === id).map((e) => e.costUsd)) ?? overall;

  return mean(taskIds.map(ofTask));
}
