import { sceneAppearanceParts } from '../appearance/sceneParts';
import { worldImagePixels } from './worldImport/image';
import { assertTextureBudget, type TextureAsset } from '../appearance/textureAsset';
import { textureHashes } from '../appearance/model';
import type { ScenePart } from '../types/robotics';
import type { ProjectSettings } from '../types/robotics';
import { refuse } from './validate';
import type { SerializedWorldAsset, SerializedWorldAssets } from './worldAssetCodec';
import { cacheWorldAssetJson, isWorldAssetHash, worldAssetJson } from './worldAssetHash';
import { restoreWorldAssetsInWorker } from './worldAssetRestoreClient';
import type { WorldHull } from './worldDecomposition';
import type { ImportedMeshWorld } from './worldImportTypes';

export interface WorldAsset {
  world: ImportedMeshWorld;
  pieces: WorldHull[];
}

export type WorldAssets = Record<string, WorldAsset>;
export type SceneAsset = WorldAsset | TextureAsset;
export type SceneAssets = Record<string, SceneAsset>;
export type { SerializedWorldAsset, SerializedWorldAssets } from './worldAssetCodec';
export { hashWorldAsset, isWorldAssetHash, worldAssetJson } from './worldAssetHash';

const assets = new Map<string, SceneAsset>();
const MAX_RETAINED_TEXTURE_BYTES = 256 * 1024 * 1024;
let retainedTextureBytes = 0;

const textureBytes = (asset: SceneAsset | undefined) =>
  asset && 'texture' in asset ? asset.texture.bytes.byteLength : 0;

function assertAssetCapacity(entries: Array<[string, SceneAsset]>): void {
  const next = entries.reduce(
    (bytes, [hash, asset]) => bytes + textureBytes(asset) - textureBytes(assets.get(hash)),
    retainedTextureBytes,
  );

  if (next > MAX_RETAINED_TEXTURE_BYTES) throw new Error('Texture memory is full.');
}

export function registerWorldAsset(hash: string, asset: SceneAsset, serializedJson?: string): void {
  if (!isWorldAssetHash(hash)) refuse('World asset hash', 'must be SHA-256');

  assertAssetCapacity([[hash, asset]]);
  retainedTextureBytes += textureBytes(asset) - textureBytes(assets.get(hash));

  if (serializedJson !== undefined) cacheWorldAssetJson(asset, serializedJson);

  assets.set(hash, asset);
}

export function getWorldAsset(hash: string): WorldAsset | undefined {
  const asset = assets.get(hash);

  return asset && 'world' in asset ? asset : undefined;
}

export function getTextureAsset(hash: string): TextureAsset | undefined {
  const asset = assets.get(hash);

  return asset && 'texture' in asset ? asset : undefined;
}

function worldAssetIn(table: SceneAssets, hash: string): WorldAsset | undefined {
  const asset = table[hash];

  return asset && 'world' in asset ? asset : undefined;
}

export function sceneWorldAssets(
  project?: Pick<ProjectSettings, 'cases' | 'study' | 'assignment'>,
  available?: SceneAssets,
): WorldAssets {
  const baseline = project?.study?.base?.project?.cases;
  const captured = Array.isArray(baseline) ? baseline : [];
  const assigned = project?.assignment?.assignment.bundle.case;
  const cases = [...(project?.cases ?? []), ...captured, ...(assigned ? [assigned] : [])];
  const hashes = new Set(cases.flatMap((kase) => (kase?.world?.imported ? [kase.world.imported.hash] : [])));

  return Object.fromEntries(
    [...hashes].map((hash) => [
      hash,
      (available ? worldAssetIn(available, hash) : getWorldAsset(hash)) ?? refuse('World asset', `is missing: ${hash}`),
    ]),
  );
}

export function sceneAssets(
  project: ProjectSettings | undefined,
  parts: ScenePart[],
  available?: SceneAssets,
): SceneAssets {
  return {
    ...sceneWorldAssets(project, available),
    ...sceneTextureAssets(sceneAppearanceParts(project, parts), available),
  };
}

export function sceneTextureAssets(parts: ScenePart[], available?: SceneAssets): SceneAssets {
  const table: SceneAssets = {};
  const hashes = textureHashes(parts);
  let bytes = 0;
  let pixels = 0;

  for (const hash of hashes) {
    const asset = available?.[hash] ?? getTextureAsset(hash);

    if (!asset || !('texture' in asset)) continue;

    bytes += asset.texture.bytes.byteLength;

    pixels += worldImagePixels(asset.texture.bytes);
    assertTextureBudget(bytes, pixels);

    table[hash] = asset;
  }

  return table;
}

export function serializeWorldAssets(table: WorldAssets): Record<string, SerializedWorldAsset>;
export function serializeWorldAssets(table: SceneAssets): SerializedWorldAssets;
export function serializeWorldAssets(table: SceneAssets): SerializedWorldAssets {
  return Object.fromEntries(Object.entries(table).map(([hash, asset]) => [hash, JSON.parse(worldAssetJson(asset))]));
}

export async function restoreWorldAssets(value: unknown): Promise<WorldAssets> {
  if (value === undefined) return {};

  const entries = await restoreWorldAssetsInWorker(value);
  const restored: WorldAssets = {};

  assertAssetCapacity(entries.map(({ hash, asset }) => [hash, asset]));

  for (const { hash, asset, serializedJson } of entries) {
    registerWorldAsset(hash, asset, serializedJson);

    if ('world' in asset) restored[hash] = asset;
  }

  return restored;
}
