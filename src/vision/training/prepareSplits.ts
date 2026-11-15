import { seedOf } from '../../datasets/datasetFile';
import { assignSources, type SourceAssignment } from '../../datasets/snapshotSplits';
import type { ImageSplit } from '../imageSplit';

export interface VisionAssignment extends SourceAssignment {
  real: boolean;
  imageSource: string;
}

function sourceGroups(assignments: VisionAssignment[]) {
  const parents = new Map<string, string>();
  const root = (key: string): string => {
    const path: string[] = [];
    let at = key;

    while (parents.has(at)) {
      path.push(at);
      at = parents.get(at)!;
    }

    path.forEach((entry) => parents.set(entry, at));

    return at;
  };

  for (const entry of assignments) {
    const one = root(`source:${entry.source}`);
    const two = root(`content:${entry.content}`);

    if (one !== two) parents.set(one < two ? two : one, one < two ? one : two);
  }

  const groups = new Map<string, number[]>();

  assignments.forEach((entry, index) => {
    const key = root(`source:${entry.source}`);
    const indexes = groups.get(key) ?? [];

    indexes.push(index);
    groups.set(key, indexes);
  });

  return [...groups].map(([key, indexes]) => ({
    key,
    indexes,
    real: indexes.every((index) => assignments[index].real),
  }));
}

type SourceGroup = ReturnType<typeof sourceGroups>[number];

function reserveTest(groups: SourceGroup[], assignments: VisionAssignment[], seed: number) {
  const eligible = groups.filter((group) => group.real);

  if (eligible.some((group) => group.indexes.some((index) => assignments[index].explicit === 'test'))) return;

  const candidates = eligible.filter((group) =>
    group.indexes.every((index) => assignments[index].explicit === undefined),
  );
  const selected = candidates.sort(
    (a, b) => seedOf(`${seed}:${a.key}`) - seedOf(`${seed}:${b.key}`) || a.key.localeCompare(b.key),
  )[0];

  if (!selected) return;

  selected.indexes.forEach((index) => {
    assignments[index] = { ...assignments[index], explicit: 'test' };
  });
}

function assignRemaining(groups: SourceGroup[], assignments: VisionAssignment[], seed: number) {
  const test = new Set(
    groups
      .filter((group) => group.indexes.some((index) => assignments[index].explicit === 'test'))
      .flatMap((group) => group.indexes),
  );
  const remaining = assignments.flatMap((entry, index) => (test.has(index) ? [] : [{ entry, index }]));
  const assigned = assignSources(
    remaining.map(({ entry }) => entry),
    seed,
  );
  const splits: ImageSplit[] = assignments.map(() => 'test');

  remaining.forEach(({ index }, at) => {
    splits[index] = assigned[at];
  });

  return splits;
}

export function prepareSplits(input: VisionAssignment[], seed: number, frozen: boolean) {
  const assignments = input.map((entry) => ({ ...entry }));
  const original = assignSources(assignments, seed);
  const groups = sourceGroups(assignments);
  const realSourceIds = [
    ...new Set(
      groups
        .filter((group) => group.real)
        .flatMap((group) => group.indexes.map((index) => assignments[index].imageSource)),
    ),
  ];

  if (frozen) return { splits: original, realSourceIds };

  reserveTest(groups, assignments, seed);

  return { splits: assignRemaining(groups, assignments, seed), realSourceIds };
}
