import { refuse } from './validate';
import { serializeWorldAsset } from './worldAssetCodec';
import { MAX_WORLD_ASSET_BYTES, MAX_WORLD_DATA_BYTES } from './worldAssetReader';
import type { WorldAsset } from './worldAssets';

const json = new WeakMap<WorldAsset, string>();

export const isWorldAssetHash = (hash: string) => /^[a-f0-9]{64}$/.test(hash);

export const cacheWorldAssetJson = (asset: WorldAsset, value: string) => json.set(asset, value);

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
