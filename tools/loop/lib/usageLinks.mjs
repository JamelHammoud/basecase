import { SHARED_LANES } from './sessionJournal.mjs';
import { usageBatches } from './usageBatches.mjs';
import { indexByStep } from './stepPulls.mjs';

const stepOf = (task) => Number(/^(?:loop-build-|step-)(\d+)(?:-|$)/.exec(task ?? '')?.[1]);
const linkStatus = (linked) => {
  if (linked.some((pull) => pull.state === 'MERGED')) return 'merged';

  return linked.some((pull) => pull.state === 'OPEN') ? 'unfinished' : 'abandoned';
};
const recordIdentity = (record) => {
  const step = stepOf(record.task);

  return record.taskId ?? (step ? `step:${step}` : null);
};

const pullOf = (task) => Number(/^(?:revise|review|rebase)-(\d+)(?:-|$)/.exec(task ?? '')?.[1]);

function unlinked(record, identity) {
  const task = identity ?? (record.workId && record.name !== 'voice' ? record.workId : null);

  return task ? { task, status: 'unfinished', pulls: [], steps: [], kind: 'unknown' } : { status: 'unattributed' };
}

const allocatedLink = (link, step) =>
  link.shared && link.steps.includes(step) ? { ...link, task: `step:${step}`, shared: false } : link;

export function usageLinks(pulls, publications) {
  const history = pulls ?? [];
  const steps = indexByStep(history);
  const batches = usageBatches(history, steps);
  const groups = history.map((pull) => new Set([pull.number]));
  const merge = (numbers) => {
    const matching = groups.filter((group) => numbers.some((number) => group.has(number)));
    const union = new Set(matching.flatMap((group) => [...group]));

    for (const group of matching) groups.splice(groups.indexOf(group), 1);

    groups.push(union);
  };

  for (const entries of steps.values()) merge(entries.map((pull) => pull.number));

  for (const pull of history) {
    for (const match of (pull.body ?? '').matchAll(/\bRebuilds #(\d+)\b/g)) merge([pull.number, Number(match[1])]);
  }

  const groupsByPull = new Map(groups.flatMap((group) => [...group].map((number) => [number, group])));
  const descriptions = new Map();
  const byBranchTask = Map.groupBy(history, (pull) => pull.headRefName?.replaceAll('/', '-'));
  const byBranch = Map.groupBy(history, (pull) => pull.headRefName);
  const byWork = Map.groupBy(
    publications.flatMap((entry) =>
      (entry.workIds ?? [entry.workId]).filter(Boolean).map((workId) => ({ ...entry, workId })),
    ),
    (entry) => entry.workId,
  );
  const describe = (numbers) => {
    const own = history.filter((pull) => numbers.has(pull.number));
    const linked = [...new Map([...own, ...batches.successors(numbers)].map((pull) => [pull.number, pull])).values()];
    const stepIds = [...steps]
      .filter(([, entries]) => entries.some((pull) => numbers.has(pull.number)))
      .map(([id]) => id);

    return {
      task: stepIds.length === 1 ? `step:${stepIds[0]}` : `pull:${Math.min(...numbers)}`,
      steps: stepIds.sort((a, b) => a - b),
      pulls: linked.map((pull) => pull.number).sort((a, b) => a - b),
      status: linkStatus(linked),
      shared: stepIds.length > 1,
      mergedAt:
        linked
          .filter((pull) => pull.state === 'MERGED')
          .map((pull) => pull.mergedAt)
          .filter(Boolean)
          .sort()[0] ?? null,
      kind:
        publications.find((entry) => numbers.has(entry.number))?.kind ??
        own
          .find((pull) => pull.title)
          ?.title?.split(':')[0]
          ?.toLowerCase() ??
        'unknown',
    };
  };
  const fromPull = (number) => {
    const shared = batches.shared(number);

    if (shared) return shared;

    const group = groupsByPull.get(number);

    if (!group) return null;

    if (!descriptions.has(group)) descriptions.set(group, describe(group));

    return descriptions.get(group);
  };

  return (record) => {
    if (record.shared ?? SHARED_LANES.has(record.name)) return { status: 'shared' };

    const identity = recordIdentity(record);
    const stepNumber = Number(/^step:(\d+)$/.exec(identity ?? '')?.[1]);
    const pullNumber = Number(/^pull:(\d+)$/.exec(identity ?? '')?.[1]) || pullOf(record.task);
    const published = byWork.get(record.workId) ?? [];
    const branches = byBranchTask.get(record.task) ?? [];
    const candidates = [
      ...new Set([
        ...(steps.get(stepNumber) ?? []).map((pull) => pull.number),
        ...(pullNumber ? [pullNumber] : []),
        ...published.flatMap((entry) =>
          entry.number ? [entry.number] : (byBranch.get(entry.branch) ?? []).map((pull) => pull.number),
        ),
        ...branches.map((pull) => pull.number),
      ]),
    ];
    const matches = [
      ...new Map(
        candidates
          .map(fromPull)
          .filter(Boolean)
          .map((match) => [match.task, match]),
      ).values(),
    ];

    if (matches.length > 1) return { status: 'ambiguous', candidates };

    if (matches.length === 1) return allocatedLink(matches[0], stepNumber);

    return unlinked(record, identity);
  };
}
