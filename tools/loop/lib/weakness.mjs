const graded = (entry) => entry.grade === 'pass' || entry.grade === 'fail';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const pct = (rate) => `${Math.round(rate * 100)}%`;

export const RETRY_AFTER_DAYS = 3;

export function taskRates(entries) {
  const byTask = new Map();

  for (const entry of entries.filter(graded)) {
    const row = byTask.get(entry.task) ?? { task: entry.task, passes: 0, graded: 0, failures: [] };

    row.graded += 1;

    if (entry.grade === 'pass') row.passes += 1;
    else row.failures.push(entry);

    byTask.set(entry.task, row);
  }

  return [...byTask.values()].map((row) => ({ ...row, rate: row.passes / row.graded }));
}

const byRateThenId = (a, b) => a.rate - b.rate || a.task.localeCompare(b.task);

export function categoryRates(entries, categoryOf) {
  const byCategory = new Map();
  const tune = entries.filter((entry) => !entry.heldOut && categoryOf[entry.task]);

  for (const row of taskRates(tune)) {
    const category = categoryOf[row.task];

    byCategory.set(category, [...(byCategory.get(category) ?? []), row]);
  }

  return [...byCategory.entries()].map(([category, tasks]) => ({
    category,
    rate: mean(tasks.map((task) => task.rate)),
    failures: tasks.reduce((sum, task) => sum + task.failures.length, 0),
    tasks: tasks.toSorted(byRateThenId),
  }));
}

const worstFirst = (a, b) => a.rate - b.rate || b.failures - a.failures || a.category.localeCompare(b.category);

export function pickWeakness({ entries, categoryOf, recent = [] }) {
  const weak = categoryRates(entries, categoryOf)
    .filter((category) => category.failures > 0)
    .sort(worstFirst);
  const fresh = weak.filter((category) => !recent.includes(category.category));

  return (fresh.length > 0 ? fresh : weak)[0] ?? null;
}

export const recentCategories = (tried, { now, days = RETRY_AFTER_DAYS }) =>
  [
    ...new Set(
      tried.filter((entry) => now - Date.parse(entry.at) < days * 24 * 60 * 60 * 1000).map((entry) => entry.category),
    ),
  ].sort();

export function shortfall(byTask, ids, seeds) {
  const counts = ids.map((id) => ({ id, have: byTask.get(id)?.length ?? 0 })).filter(({ have }) => have < seeds);

  return {
    tasks: counts.map(({ id }) => id),
    seeds: counts.length === 0 ? 0 : Math.max(...counts.map(({ have }) => seeds - have)),
  };
}

export const runsOf = (byTask) => [...new Set([...byTask.values()].flat().map((entry) => entry.run))].sort();

const taskLine = (task, titleOf) =>
  `- ${task.task} “${titleOf[task.task] ?? task.task}”: ${task.passes} of ${task.graded} runs pass`;

export function weaknessMarkdown(weakness, { titleOf, settings, harness }) {
  return [
    `The CAD agent does worst on **${weakness.category}** micro-evals: ${pct(weakness.rate)} of runs pass across its ${weakness.tasks.length} tune tasks on \`main\` (harness \`${harness}\`, \`${settings.served}\`, effort ${settings.effort}).`,
    '',
    ...weakness.tasks.map((task) => taskLine(task, titleOf)),
  ].join('\n');
}
