import { reviewOutcomeTotals } from './usageTotals.mjs';

const within = (at, since, until) => at && Date.parse(at) >= since && Date.parse(at) < until;
const average = (tasks, key) => {
  if (!tasks.length || tasks.some((task) => task[key] === null)) return null;

  return tasks.reduce((sum, task) => sum + task[key], 0) / tasks.length;
};

export function completionWindow(work, { since, until, pulls }) {
  const completed = work.tasks.filter((task) => within(task.mergedAt, since, until));
  const shared = work.sharedTasks.filter((task) => within(task.mergedAt, since, until));
  const observed = new Set([...completed, ...shared].flatMap((task) => task.pulls));
  const merged = pulls?.filter((pull) => pull.state === 'MERGED' && within(pull.mergedAt, since, until));

  return {
    since,
    until,
    historyAvailable: pulls !== null,
    mergedPulls: merged?.length ?? null,
    mergedPullsByKind: merged
      ? Object.fromEntries(
          Object.entries(Object.groupBy(merged, (pull) => pull.title?.split(':')[0]?.toLowerCase() ?? 'unknown')).map(
            ([kind, entries]) => [
              kind,
              { completions: entries.length, completionsPerDay: entries.length / ((until - since) / 86_400_000) },
            ],
          ),
        )
      : null,
    unobservedMergedPulls: merged?.filter((pull) => !observed.has(pull.number)).map((pull) => pull.number) ?? null,
    unknownMergeDates: work.tasks.filter((task) => !task.mergedAt).length,
    sharedCompletions: shared,
    tasks: completed,
    byKind: Object.fromEntries(
      Object.entries(Object.groupBy(completed, (task) => task.kind)).map(([kind, tasks]) => [
        kind,
        {
          completions: tasks.length,
          completionsPerDay: tasks.length / ((until - since) / 86_400_000),
          reviewAttempts: tasks.reduce((sum, task) => sum + task.reviewAttempts, 0),
          reviewOutcomes: reviewOutcomeTotals(tasks),
          tokensPerCompletion: average(tasks, 'tokens'),
          millisecondsPerCompletion: average(tasks, 'milliseconds'),
        },
      ]),
    ),
  };
}
