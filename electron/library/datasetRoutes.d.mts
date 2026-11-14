import type { DatasetStore } from './datasetStore.mjs';

export const DATASET_CALLS: Record<string, (store: DatasetStore, payload?: unknown) => unknown>;

export function datasetPostRoutes(
  store: DatasetStore,
): Array<[string, (body: { arg?: unknown } | null) => Promise<unknown>]>;
