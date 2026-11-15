import { reply } from '../utils/workerRpc';
import { asRecord, refuse } from './validate';
import { validateWorldAssetPayloads } from './worldAssetPayloads';
import { readWorldAsset } from './worldAssetReader';
import { hashWorldAsset, isWorldAssetHash, worldAssetJson } from './worldAssetHash';
import type { WorldAsset } from './worldAssets';

export interface RestoredWorldAsset {
  hash: string;
  asset: WorldAsset;
  serializedJson: string;
}

function assetBuffers({ world, pieces }: WorldAsset): ArrayBuffer[] {
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

  for (const [hash, raw] of Object.entries(asRecord(value, 'World assets'))) {
    if (!isWorldAssetHash(hash)) refuse('World asset hash', 'must be SHA-256');

    const asset = readWorldAsset(raw);

    if ((await hashWorldAsset(asset)) !== hash) refuse('World asset hash', 'does not match its content');

    await validateWorldAssetPayloads(asset);
    entries.push({ hash, asset, serializedJson: worldAssetJson(asset) });
  }

  return reply(entries, [...new Set(entries.flatMap(({ asset }) => assetBuffers(asset)))]);
}

export const worldAssetRestoreHandlers = { restoreWorldAssets };
