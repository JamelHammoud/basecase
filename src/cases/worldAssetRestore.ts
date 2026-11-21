import { worldImagePixels } from './worldImport/image';
import { readTextureAsset, serializeTextureAsset, assertTextureBudget } from '../appearance/textureAsset';
import type { SceneAsset } from './worldAssets';
import { reply } from '../utils/workerRpc';
import { asRecord, refuse } from './validate';
import { validateWorldAssetPayloads } from './worldAssetPayloads';
import { readWorldAsset } from './worldAssetReader';
import { hashWorldAsset, isWorldAssetHash, worldAssetJson } from './worldAssetHash';

export interface RestoredWorldAsset {
  hash: string;
  asset: SceneAsset;
  serializedJson: string;
}

function assetBuffers(asset: SceneAsset): ArrayBuffer[] {
  if ('texture' in asset) return [asset.texture.bytes.buffer as ArrayBuffer];

  const { world, pieces } = asset;
  const { mesh, splat } = world;

  return [
    mesh.positions.buffer,
    mesh.indices.buffer,
    mesh.normals.buffer,
    ...(mesh.colors ? [mesh.colors.buffer] : []),
    ...(mesh.uvs ? [mesh.uvs.buffer] : []),
    ...(splat ? [splat.bytes.buffer] : []),
    ...mesh.materials.flatMap((material) => (material.image ? [material.image.bytes.buffer] : [])),
    ...pieces.flatMap((piece) => [piece.positions.buffer, piece.indices.buffer]),
  ] as ArrayBuffer[];
}

async function restoreWorldAssets(value: unknown) {
  const entries: RestoredWorldAsset[] = [];
  let textureBytes = 0;
  let texturePixels = 0;

  for (const [hash, raw] of Object.entries(asRecord(value, 'World assets'))) {
    if (!isWorldAssetHash(hash)) refuse('World asset hash', 'must be SHA-256');

    if (raw && typeof raw === 'object' && 'texture' in raw) {
      const asset = await readTextureAsset(hash, raw);

      textureBytes += asset.texture.bytes.byteLength;

      texturePixels += worldImagePixels(asset.texture.bytes);
      assertTextureBudget(textureBytes, texturePixels);

      entries.push({ hash, asset, serializedJson: JSON.stringify(serializeTextureAsset(asset)) });

      continue;
    }

    const asset = readWorldAsset(raw);

    if ((await hashWorldAsset(asset)) !== hash) refuse('World asset hash', 'does not match its content');

    await validateWorldAssetPayloads(asset);
    entries.push({ hash, asset, serializedJson: worldAssetJson(asset) });
  }

  return reply(entries, [...new Set(entries.flatMap(({ asset }) => assetBuffers(asset)))]);
}

export const worldAssetRestoreHandlers = { restoreWorldAssets };
