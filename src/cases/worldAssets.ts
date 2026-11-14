import type { ProjectSettings } from '../types/robotics';
import { asRecord, refuse } from './validate';
import { serializeWorldAsset, type SerializedWorldAssets } from './worldAssetCodec';
import { MAX_WORLD_ASSET_BYTES, MAX_WORLD_DATA_BYTES, readWorldAsset } from './worldAssetReader';
import { validateWorldAssetPayloads } from './worldAssetPayloads';
import type { WorldHull } from './worldDecomposition';
import type { ImportedMeshWorld } from './worldImportTypes';

export interface WorldAsset {
  world: ImportedMeshWorld;
  pieces: WorldHull[];
}

export type WorldAssets = Record<string, WorldAsset>;
export type { SerializedWorldAsset, SerializedWorldAssets } from './worldAssetCodec';

const assets = new Map<string, WorldAsset>();
const json = new WeakMap<WorldAsset, string>();

export const isWorldAssetHash = (hash: string) => /^[a-f0-9]{64}$/.test(hash);

export function worldAssetJson(asset: WorldAsset): string {
  const known = json.get(asset);

  if (known) return known;

  const result = JSON.stringify(serializeWorldAsset(asset));

  json.set(asset, result);

  return result;
}

export async function hashWorldAsset(asset: WorldAsset): Promise<string> {
  assertWorldAssetBudget(asset);

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(worldAssetJson(asset)));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function assertWorldAssetBudget({ world, pieces }: WorldAsset): void {
  const { mesh } = world;
  const arrays = [mesh.positions, mesh.indices, mesh.normals, mesh.colors, mesh.uvs];
  const geometryBytes = [...arrays, ...pieces.flatMap((piece) => [piece.positions, piece.indices])].reduce(
    (total, array) => total + (array?.byteLength ?? 0),
    0,
  );
  const dataBytes = mesh.materials.reduce(
    (total, material) => total + (material.image?.bytes.byteLength ?? 0),
    world.splat?.bytes.byteLength ?? 0,
  );

  if (geometryBytes + dataBytes > MAX_WORLD_ASSET_BYTES || dataBytes > MAX_WORLD_DATA_BYTES)
    refuse('World asset', 'is too large');
}

export function registerWorldAsset(hash: string, asset: WorldAsset, serializedJson?: string): void {
  if (!isWorldAssetHash(hash)) refuse('World asset hash', 'must be SHA-256');

  if (serializedJson !== undefined) json.set(asset, serializedJson);

  assets.set(hash, asset);
}

export const getWorldAsset = (hash: string): WorldAsset | undefined => assets.get(hash);

export function sceneWorldAssets(project?: Pick<ProjectSettings, 'cases'>, available?: WorldAssets): WorldAssets {
  const hashes = new Set(
    (project?.cases ?? []).flatMap((kase) => (kase.world.imported ? [kase.world.imported.hash] : [])),
  );

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

  const entries = Object.entries(asRecord(value, 'World assets'));

  const restored: WorldAssets = {};

  for (const [hash, raw] of entries) {
    if (!isWorldAssetHash(hash)) refuse('World asset hash', 'must be SHA-256');

    const asset = readWorldAsset(raw);

    if ((await hashWorldAsset(asset)) !== hash) refuse('World asset hash', 'does not match its content');

    await validateWorldAssetPayloads(asset);

    restored[hash] = asset;
  }

  for (const [hash, asset] of Object.entries(restored)) registerWorldAsset(hash, asset);

  return restored;
}
