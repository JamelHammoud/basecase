import type { ProjectSettings } from '../types/robotics';
import { refuse } from './validate';
import type { SerializedWorldAssets } from './worldAssetCodec';
import { cacheWorldAssetJson, isWorldAssetHash, worldAssetJson } from './worldAssetHash';
import { restoreWorldAssetsInWorker } from './worldAssetRestoreClient';
import type { WorldHull } from './worldDecomposition';
import type { ImportedMeshWorld } from './worldImportTypes';

export interface WorldAsset {
  world: ImportedMeshWorld;
  pieces: WorldHull[];
}

export type WorldAssets = Record<string, WorldAsset>;
export type { SerializedWorldAsset, SerializedWorldAssets } from './worldAssetCodec';
export { hashWorldAsset, isWorldAssetHash, worldAssetJson } from './worldAssetHash';

const assets = new Map<string, WorldAsset>();

export function registerWorldAsset(hash: string, asset: WorldAsset, serializedJson?: string): void {
  if (!isWorldAssetHash(hash)) refuse('World asset hash', 'must be SHA-256');

  if (serializedJson !== undefined) cacheWorldAssetJson(asset, serializedJson);

  assets.set(hash, asset);
}

export const getWorldAsset = (hash: string): WorldAsset | undefined => assets.get(hash);

export function sceneWorldAssets(
  project?: Pick<ProjectSettings, 'cases' | 'study'>,
  available?: WorldAssets,
): WorldAssets {
  const baseline = project?.study?.base?.project?.cases;
  const captured = Array.isArray(baseline) ? baseline : [];
  const cases = [...(project?.cases ?? []), ...captured];
  const hashes = new Set(cases.flatMap((kase) => (kase?.world?.imported ? [kase.world.imported.hash] : [])));

  return Object.fromEntries(
    [...hashes].map((hash) => [
      hash,
      (available ? available[hash] : getWorldAsset(hash)) ?? refuse('World asset', `is missing: ${hash}`),
    ]),
  );
}

export const serializeWorldAssets = (table: WorldAssets): SerializedWorldAssets =>
  Object.fromEntries(Object.entries(table).map(([hash, asset]) => [hash, JSON.parse(worldAssetJson(asset))]));

export async function restoreWorldAssets(value: unknown): Promise<WorldAssets> {
  if (value === undefined) return {};

  const entries = await restoreWorldAssetsInWorker(value);
  const restored: WorldAssets = {};

  for (const { hash, asset, serializedJson } of entries) {
    registerWorldAsset(hash, asset, serializedJson);
    restored[hash] = asset;
  }

  return restored;
}
