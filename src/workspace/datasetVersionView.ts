import { summaryOf, type TrySummary } from '../cases/tryFile';
import type { Dataset } from '../datasets/datasetFile';
import { membersOf } from '../datasets/datasetView';

export function selectedDataset(dataset: Dataset | null, n: number | null): Dataset | null {
  const version = dataset?.versions.find((v) => v.n === n);

  if (!dataset || !version) return dataset;

  return {
    ...dataset,
    selectedVersion: version.n,
    task: version.snapshot?.task ?? dataset.task,
    members: version.members,
    imageMembers: version.imageMembers ?? [],
  };
}

export function datasetVersionMembers(dataset: Dataset, all: TrySummary[]): TrySummary[] {
  const version = dataset.versions.find((v) => v.n === dataset.selectedVersion);

  if (!version?.snapshot) return membersOf(dataset, all);

  const summaries = new Map<string, TrySummary>();

  for (const sample of version.snapshot.samples) {
    const previous = summaries.get(sample.tryId);
    const frames = sample.to - sample.from + (previous?.frames ?? 0);

    summaries.set(sample.tryId, {
      ...summaryOf(sample.stored, { recording: false, strip: false }),
      frames,
      seconds: frames / sample.stored.rate,
    });
  }

  return [...summaries.values()];
}
