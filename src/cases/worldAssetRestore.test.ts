import { describe, expect, it } from 'vitest';
import { worldAssetRestoreHandlers } from './worldAssetRestore';
import { meshWorldAsset } from './worldAssets.fixtures';
import { getWorldAsset, hashWorldAsset, serializeWorldAssets, worldAssetJson } from './worldAssets';
import { splatPly } from './worldImport/fixtures';
import { readSplat } from './worldImport/splat';

describe('world restore worker operation', () => {
  it('validates and transfers all decoded buffers without registering them inside the worker operation', async () => {
    const asset = meshWorldAsset();

    asset.world.name = 'Worker restore buffers';
    asset.world.mesh.colors = new Float32Array(9);
    asset.world.mesh.uvs = new Float32Array(6);
    asset.world.splat = await readSplat(splatPly());

    const hash = await hashWorldAsset(asset);
    const { result, transfer } = await worldAssetRestoreHandlers.restoreWorldAssets(
      serializeWorldAssets({ [hash]: asset }),
    );
    const restored = result[0];
    const { mesh, splat } = restored.asset.world;
    const buffers = [
      mesh.positions.buffer,
      mesh.indices.buffer,
      mesh.normals.buffer,
      mesh.colors?.buffer,
      mesh.uvs?.buffer,
      splat?.bytes.buffer,
      ...restored.asset.pieces.flatMap((piece) => [piece.positions.buffer, piece.indices.buffer]),
    ];

    expect(restored.hash).toBe(hash);
    expect(restored.serializedJson).toBe(worldAssetJson(asset));
    expect(transfer).toEqual(buffers);
    expect(new Set(transfer).size).toBe(transfer?.length);
    expect(getWorldAsset(hash)).toBeUndefined();
  });
});
