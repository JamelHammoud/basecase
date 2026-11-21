import { loadRecordingBytes } from '../cases/tryStore';
import { loadDatasets, saveDataset } from '../datasets/datasetStore';
import type { Dataset, DatasetSample } from '../datasets/datasetFile';
import { snapshotWorker } from '../datasets/snapshotWorker';
import { mergedDatasetSamples } from '../datasets/datasetSelections';
import type { SimModel } from '../sim/mjcfTypes';

export async function selectCorrections(input: { dataset: Dataset; ids: string[]; model: SimModel }) {
  const { ids, model } = input;
  const dataset = (await loadDatasets()).find((saved) => saved.id === input.dataset.id) ?? input.dataset;
  const samples: DatasetSample[] = [];

  for (const tryId of ids) {
    const bytes = await loadRecordingBytes(tryId);

    if (!bytes) throw new Error('The dataset is missing recording content.');

    const inspected = await snapshotWorker.call('inspect', { bytes, model });

    if (!inspected.corrections.length) throw new Error('Select a window with operator actions.');

    samples.push(...inspected.corrections.map((window) => ({ tryId, target: 'correction' as const, ...window })));
  }

  const before = (dataset.samples ?? dataset.members.map((tryId) => ({ tryId }))).filter(
    (sample) => !ids.includes(sample.tryId),
  );

  await saveDataset({
    ...dataset,
    selectedVersion: undefined,
    samples: mergedDatasetSamples({ ...dataset, samples: before }, [], samples),
  });
}
