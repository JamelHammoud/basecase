import { membersOf } from './evidence.mjs';

export function usageBatches(history, steps) {
  const batches = history.filter(
    (pull) => pull.headRefName?.startsWith('loop/batch/') || pull.title?.startsWith('Batch:'),
  );
  const members = new Map(batches.map((pull) => [pull.number, membersOf(pull.body)]));
  const successors = (numbers) =>
    batches.filter((pull) => members.get(pull.number).some((number) => numbers.has(number)));
  const shared = (number) => {
    const memberNumbers = members.get(number);

    if (!memberNumbers?.length) return null;

    const pull = batches.find((entry) => entry.number === number);

    return {
      task: `batch:${number}`,
      steps: [...steps]
        .filter(([, pulls]) => pulls.some((entry) => memberNumbers.includes(entry.number)))
        .map(([step]) => step),
      pulls: [number, ...memberNumbers].sort((a, b) => a - b),
      status: { MERGED: 'merged', OPEN: 'unfinished', CLOSED: 'abandoned' }[pull.state] ?? 'unfinished',
      shared: true,
      mergedAt: pull.mergedAt ?? null,
      kind: 'batch',
    };
  };

  return { successors, shared };
}
