import { summaryRecord } from '../cases/tryFile';
import type { TryRecord } from '../cases/tries';
import { useTries } from '../cases/tryStore';
import { freezeVersion, versionHash, type Dataset, type DatasetVersion } from '../datasets/datasetFile';
import { saveDataset } from '../datasets/datasetStore';

export interface DatasetRecords {
  of: (dataset: Dataset) => TryRecord[];
  freeze: (dataset: Dataset, modelHash: string) => Promise<DatasetVersion>;
}

export function useDatasetRecords(sceneTries: TryRecord[]): DatasetRecords {
  const summaries = useTries() ?? [];

  return {
    of: (dataset) => {
      const scene = new Map(sceneTries.map((t) => [t.id, t]));
      const stored = new Map(summaries.map((t) => [t.id, t]));

      return dataset.members.flatMap((id) => {
        const summary = stored.get(id);

        return scene.get(id) ?? (summary ? [summaryRecord(summary)] : []);
      });
    },
    freeze: async (dataset, modelHash) => {
      const hash = await versionHash(dataset, summaries, modelHash);
      const frozen = freezeVersion(dataset, hash, new Date().toISOString());

      if (frozen.dataset !== dataset) await saveDataset(frozen.dataset);

      return frozen.version;
    },
  };
}
