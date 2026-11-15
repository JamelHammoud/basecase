import type { Dataset, DatasetSample } from './datasetFile';

export function mergedDatasetSamples(dataset: Dataset, ids: string[], selected?: DatasetSample[]): DatasetSample[] {
  const before: DatasetSample[] = dataset.samples ?? dataset.members.map((tryId) => ({ tryId }));
  const added: DatasetSample[] = selected ?? ids.map((tryId) => ({ tryId }));
  const samples = [...before, ...added];
  const whole = new Set(samples.filter((sample) => sample.from === undefined).map((sample) => sample.tryId));
  const retained = samples.filter((sample) => sample.from === undefined || !whole.has(sample.tryId));

  return [
    ...new Map(retained.map((sample) => [JSON.stringify([sample.tryId, sample.from, sample.to]), sample])).values(),
  ];
}
