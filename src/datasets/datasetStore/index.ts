import { useEffect, useSyncExternalStore } from 'react';
import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import { readDataset, type Dataset } from '../datasetFile';
import { desktopDatasets } from './desktopDatasets';
import type { DatasetBackend } from './types';
import { webDatasets } from './webDatasets';

const backend: DatasetBackend = IS_WEB_DEMO ? webDatasets : desktopDatasets;

let listed: Dataset[] | null = null;
let loading: Promise<Dataset[]> | null = null;
const listeners = new Set<() => void>();

const byNewest = (a: Dataset, b: Dataset) => Number(b.createdAt > a.createdAt) - Number(b.createdAt < a.createdAt);

function publish(next: Dataset[]) {
  listed = [...next].sort(byNewest);
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};

const readAll = (found: unknown[]) => found.flatMap((raw) => readDataset(raw) ?? []);

export function loadDatasets(): Promise<Dataset[]> {
  if (listed) return Promise.resolve(listed);

  loading ??= backend.list().then(
    (found) => {
      publish(readAll(found));

      return listed ?? [];
    },
    () => {
      loading = null;

      return [];
    },
  );

  return loading;
}

export function useDatasets(): Dataset[] | null {
  const datasets = useSyncExternalStore(subscribe, () => listed);

  useEffect(() => {
    void loadDatasets();
  }, []);

  return datasets;
}

async function update(change: (datasets: Dataset[]) => Dataset[]) {
  await loadDatasets();

  if (listed) publish(change(listed));
}

export async function saveDataset(dataset: Dataset): Promise<void> {
  await backend.save(dataset);
  await update((datasets) => [...datasets.filter((d) => d.id !== dataset.id), dataset]);
}

export async function deleteDatasets(ids: string[]): Promise<void> {
  if (!ids.length) return;

  await backend.delete(ids);

  const gone = new Set(ids);

  await update((datasets) => datasets.filter((d) => !gone.has(d.id)));
}
