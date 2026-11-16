import { usageLinks } from './usageLinks.mjs';
import { sessionTotals } from './usageTotals.mjs';

const workBreakdown = (records, key) =>
  Object.fromEntries(
    Object.entries(Object.groupBy(records, (record) => record[key] ?? 'unknown')).map(([name, entries]) => [
      name,
      sessionTotals(entries),
    ]),
  );

function taskSummary(link, sessions) {
  return {
    ...link,
    kind:
      sessions.find((record) => record.taskKind)?.taskKind ??
      sessions.find((record) => record.result?.kind)?.result.kind ??
      link.kind,
    workers: [...new Set(sessions.map((record) => record.worker).filter(Boolean))].sort(),
    reviewAttempts: sessions.filter((record) => record.name === 'review').length,
    reviewOutcomes: Object.fromEntries(
      Object.entries(
        Object.groupBy(
          sessions.filter((record) => record.name === 'review'),
          (record) => record.reviewOutcome ?? 'unknown',
        ),
      ).map(([verdict, entries]) => [verdict, entries.length]),
    ),
    invocations: sessions.map((record) => record.id ?? null),
    providers: workBreakdown(sessions, 'provider'),
    models: workBreakdown(sessions, 'model'),
    ...sessionTotals(sessions),
  };
}

const partitionOf = (record, link) => {
  if (record.state === 'running') return 'running';

  return link.shared ? 'shared' : link.status;
};

export function taskUsage(records, pulls, publications = []) {
  const resolve = usageLinks(pulls, publications);
  const partitions = Object.fromEntries(
    ['merged', 'unfinished', 'abandoned', 'running', 'shared', 'unattributed', 'ambiguous'].map((status) => [
      status,
      [],
    ]),
  );
  const groups = new Map();
  const provenance = [];

  for (const record of records) {
    const link = resolve(record);
    const status = partitionOf(record, link);

    partitions[status].push(record);
    provenance.push({
      invocation: record.id ?? null,
      taskId: record.taskId ?? null,
      workId: record.workId ?? null,
      continuedFrom: record.continuedFrom ?? null,
      previousInvocation: record.previousInvocation ?? null,
      provider: record.provider ?? null,
      model: record.model ?? null,
      worker: record.worker ?? null,
      task: link.task ?? null,
      status,
      candidates: link.candidates,
      steps: link.steps,
      pulls: link.pulls,
    });

    if (!link.task || record.state === 'running') continue;

    const group = groups.get(link.task) ?? { link, sessions: [] };

    group.sessions.push(record);
    groups.set(link.task, group);
  }

  const allTasks = [...groups.values()].map(({ link, sessions }) => taskSummary(link, sessions));
  const tasks = allTasks.filter((task) => task.status === 'merged' && !task.shared);
  const mergedWork = sessionTotals(partitions.merged);
  const perTask = (key) => (tasks.length && mergedWork[key] !== null ? mergedWork[key] / tasks.length : null);

  return {
    linkageAvailable: pulls !== null,
    mergedTasks: tasks.length,
    tasks,
    pendingTasks: allTasks.filter((task) => task.status !== 'merged'),
    sharedTasks: allTasks.filter((task) => task.shared),
    provenance,
    reconciliation: {
      inputSessions: records.length,
      accountedSessions: Object.values(partitions).reduce((sum, entries) => sum + entries.length, 0),
      matched: provenance.filter((entry) => entry.task && entry.status !== 'ambiguous').length,
      shared: partitions.shared.length,
      unmatched: partitions.unattributed.length,
      ambiguous: partitions.ambiguous.length,
    },
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
    unmerged: sessionTotals([...partitions.unfinished, ...partitions.abandoned]),
    ...Object.fromEntries(
      Object.entries(partitions)
        .filter(([key]) => key !== 'merged')
        .map(([key, entries]) => [key, sessionTotals(entries)]),
    ),
  };
}
