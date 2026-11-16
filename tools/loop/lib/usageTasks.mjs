import { indexByStep } from './stepPulls.mjs';
import { sessionTotals } from './usageTotals.mjs';

const taskStep = (task) => Number(/^(?:loop-build-|step-)(\d+)(?:-|$)/.exec(task)?.[1]);
const taskPull = (task) => Number(/^(?:revise|review|rebase)-(\d+)(?:-|$)/.exec(task)?.[1]);

function linkedStep(record, index) {
  const step = taskStep(record.task);

  if (index.has(step)) return step;

  const pullNumber = taskPull(record.task);
  const matches = [...index].filter(([, pulls]) =>
    pulls.some((pull) => pull.number === pullNumber || pull.headRefName?.replaceAll('/', '-') === record.task),
  );

  return matches.length === 1 ? matches[0][0] : null;
}

export function taskUsage(records, pulls) {
  const index = indexByStep(pulls ?? []);
  const groups = new Map();
  const unattributed = [];
  const unmerged = [];

  for (const record of records) {
    const step = linkedStep(record, index);

    if (!step) {
      unattributed.push(record);

      continue;
    }

    if (!index.get(step).some((pull) => pull.state === 'MERGED')) {
      unmerged.push(record);

      continue;
    }

    groups.set(step, [...(groups.get(step) ?? []), record]);
  }

  const tasks = [...groups]
    .sort(([a], [b]) => a - b)
    .map(([step, sessions]) => ({
      task: `step:${step}`,
      kind:
        sessions.find((session) => session.taskKind)?.taskKind ??
        sessions.find((session) => session.name === 'build' && session.result?.kind)?.result.kind ??
        'unknown',
      workers: [...new Set(sessions.map((session) => session.worker).filter(Boolean))].sort(),
      reviewAttempts: sessions.filter((session) => session.name === 'review').length,
      pulls: index
        .get(step)
        .map((pull) => pull.number)
        .sort((a, b) => a - b),
      ...sessionTotals(sessions),
    }));
  const mergedWork = sessionTotals([...groups.values()].flat());
  const perTask = (key) => (tasks.length && mergedWork[key] !== null ? mergedWork[key] / tasks.length : null);

  return {
    linkageAvailable: pulls !== null,
    mergedTasks: tasks.length,
    tasks,
    byKind: Object.fromEntries(
      Object.entries(Object.groupBy(tasks, (task) => task.kind)).map(([kind, completed]) => [
        kind,
        {
          mergedTasks: completed.length,
          failedAttempts: completed.reduce((sum, task) => sum + task.failedAttempts, 0),
          reviewAttempts: completed.reduce((sum, task) => sum + task.reviewAttempts, 0),
          tokensPerMergedTask: completed.every((task) => task.tokens !== null)
            ? completed.reduce((sum, task) => sum + task.tokens, 0) / completed.length
            : null,
          millisecondsPerMergedTask: completed.every((task) => task.milliseconds !== null)
            ? completed.reduce((sum, task) => sum + task.milliseconds, 0) / completed.length
            : null,
        },
      ]),
    ),
    mergedWork,
    workPerMergedTask: { tokens: perTask('tokens'), milliseconds: perTask('milliseconds') },
    unmerged: sessionTotals(unmerged),
    unattributed: sessionTotals(unattributed),
  };
}
