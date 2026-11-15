import type { TryRecord } from '../cases/tries';
import { useTries } from '../cases/tryStore';
import { tryRecordOf } from '../cases/tryFile';
import { freezeVersion, versionHash, type Dataset, type DatasetVersion } from '../datasets/datasetFile';
import { loadDatasets, saveDataset } from '../datasets/datasetStore';
import { resolveSnapshot, snapshotHash } from '../datasets/datasetSnapshot';
import { loadDatasetContent, saveDatasetContent } from '../datasets/datasetStore/content';
import type { DatasetSnapshot } from '../datasets/snapshotTypes';
import type { SimModel } from '../sim/mjcfTypes';
import type { DatasetScene } from './datasetJob';
import { memberRecord } from '../datasets/datasetView';
import { encodeJson as encodeSnapshotJson, decodeJson as decodeSnapshotJson } from '../datasets/snapshotWorker';

const writes = new Map<string, Promise<unknown>>();

function datasetWrite<T>(id: string, write: () => Promise<T>): Promise<T> {
  const result = (writes.get(id) ?? Promise.resolve()).catch(() => {}).then(write);

  writes.set(id, result);
  void result
    .finally(() => {
      if (writes.get(id) === result) writes.delete(id);
    })
    .catch(() => {});

  return result;
}

const currentDataset = async (dataset: Dataset) =>
  (await loadDatasets()).find((stored) => stored.id === dataset.id) ?? dataset;

async function archivedContent(hash: string) {
  const bytes = await loadDatasetContent(hash);

  if (!bytes) throw new Error('The dataset is missing its saved export.');

  return bytes;
}

async function selectedSnapshotVersion(dataset: Dataset): Promise<DatasetVersion> {
  const version = dataset.versions.find((entry) => entry.n === dataset.selectedVersion);

  if (!version?.snapshot)
    throw new Error('This version has no saved samples. Export the working dataset to save them.');

  if ((await snapshotHash(version.snapshot)) !== version.hash) throw new Error('The saved dataset samples changed.');

  return version;
}

export interface DatasetRecords {
  of: (dataset: Dataset) => TryRecord[];
  freeze: (dataset: Dataset, modelHash: string, snapshot?: DatasetSnapshot) => Promise<DatasetVersion>;
  resolve: (dataset: Dataset, model?: SimModel, context?: DatasetScene) => Promise<DatasetVersion>;
  archive: (dataset: Dataset, version: DatasetVersion, bytes: Uint8Array) => Promise<Uint8Array>;
  scene: (version: DatasetVersion) => Promise<DatasetScene | null>;
}

export function useDatasetRecords(sceneTries: TryRecord[]): DatasetRecords {
  const summaries = useTries() ?? [];
  const freeze: DatasetRecords['freeze'] = (dataset, modelHash, snapshot) =>
    datasetWrite(dataset.id, async () => {
      const current = await currentDataset(dataset);
      const hash = snapshot ? await snapshotHash(snapshot) : await versionHash(dataset, summaries, modelHash);
      const frozen = freezeVersion(
        { ...current, ...dataset, versions: current.versions },
        hash,
        new Date().toISOString(),
        snapshot,
      );

      if (frozen.version !== current.versions.at(-1)) await saveDataset(frozen.dataset);

      return frozen.version;
    });

  return {
    of: (dataset) => {
      const selected = dataset.versions.find((version) => version.n === dataset.selectedVersion)?.snapshot;

      if (selected)
        return selected.samples
          .filter((sample) => !sample.excluded.length)
          .map((sample) => ({ ...tryRecordOf(sample.stored), passed: true }));

      const scene = new Map(sceneTries.map((t) => [t.id, t]));
      const stored = new Map(summaries.map((t) => [t.id, t]));

      return dataset.members.flatMap((id) => {
        const summary = stored.get(id);

        return scene.get(id) ?? (summary ? [memberRecord(summary)] : []);
      });
    },
    freeze,
    resolve: async (dataset, model, context) => {
      if (dataset.selectedVersion !== undefined) return selectedSnapshotVersion(dataset);

      const reference = context ? await saveDatasetContent(await encodeSnapshotJson(context)) : undefined;
      const snapshot = await resolveSnapshot({ dataset, model, context: reference });

      return freeze(dataset, snapshot.modelHash, snapshot);
    },
    archive: (dataset, version, bytes) =>
      datasetWrite(dataset.id, async () => {
        const hash = await saveDatasetContent(bytes);
        const current = await currentDataset(dataset);
        const stored = current.versions.find((entry) => entry.n === version.n && entry.hash === version.hash);

        if (!stored) throw new Error('The saved dataset version is missing.');

        if (stored.archive) return archivedContent(stored.archive);

        await saveDataset({
          ...current,
          versions: current.versions.map((entry) => (entry === stored ? { ...stored, archive: hash } : entry)),
        });

        return bytes;
      }),
    scene: async (version) => {
      const reference = version.snapshot?.context;

      if (!reference) return null;

      const bytes = await loadDatasetContent(reference);

      if (!bytes) throw new Error('The dataset is missing its saved scene.');

      const context = (await decodeSnapshotJson(bytes)) as DatasetScene;

      if (
        !context?.model ||
        !Array.isArray(context.parts) ||
        !Array.isArray(context.world) ||
        !Array.isArray(context.guests)
      ) {
        throw new Error('The saved dataset scene is damaged.');
      }

      return context;
    },
  };
}
