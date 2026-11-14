import { describe, expect, it } from 'vitest';
import {
  getWorldAsset,
  hashWorldAsset,
  registerWorldAsset,
  restoreWorldAssets,
  serializeWorldAssets,
  worldAssetJson,
} from './worldAssets';
import { meshWorldAsset } from './worldAssets.fixtures';
import { base64ToBytes } from '../utils/base64';
import { splatSpz } from './worldImport/fixtures';

describe('world asset persistence', () => {
  it('restores scenes with more than sixteen individually bounded worlds', async () => {
    const table: Record<string, ReturnType<typeof meshWorldAsset>> = {};

    for (let i = 0; i < 17; i++) {
      const asset = meshWorldAsset();

      asset.world.name = `Room ${i}`;
      table[await hashWorldAsset(asset)] = asset;
    }

    expect(Object.keys(await restoreWorldAssets(serializeWorldAssets(table)))).toHaveLength(17);
  });

  it('refuses oversized prepared assets before encoding their repeated texture and geometry buffers', async () => {
    const asset = meshWorldAsset();
    const image = { mimeType: 'image/png', bytes: new Uint8Array(1024 * 1024) };
    const material = { ...asset.world.mesh.materials[0], image };

    asset.world.mesh.materials = Array.from({ length: 65 }, () => material);

    await expect(hashWorldAsset(asset)).rejects.toThrow('large');

    const geometry = meshWorldAsset();
    const positions = new Float32Array(1024 * 1024);

    geometry.pieces = Array.from({ length: 33 }, () => ({ positions, indices: Uint32Array.from([0, 1, 2]) }));

    await expect(hashWorldAsset(geometry)).rejects.toThrow('large');
  });

  it('restores typed geometry once under its content hash', async () => {
    const asset = meshWorldAsset();
    const hash = await hashWorldAsset(asset);

    registerWorldAsset(hash, asset);

    const serialized = serializeWorldAssets({ [hash]: asset });
    const restored = await restoreWorldAssets(JSON.parse(JSON.stringify(serialized)));

    expect(restored[hash].world.mesh.positions).toEqual(asset.world.mesh.positions);
    expect(restored[hash].pieces[0].indices).toEqual(asset.pieces[0].indices);
    expect(getWorldAsset(hash)).toBe(restored[hash]);
    expect(worldAssetJson(restored[hash])).toBe(worldAssetJson(asset));
  });

  it('refuses changed content and malformed buffers', async () => {
    const asset = meshWorldAsset();
    const hash = await hashWorldAsset(asset);
    const serialized = serializeWorldAssets({ [hash]: asset });

    serialized[hash].world.name = 'Changed';

    await expect(restoreWorldAssets(serialized)).rejects.toThrow('hash');

    serialized[hash].world.mesh.positions = '%%%';

    await expect(restoreWorldAssets(serialized)).rejects.toThrow();
  });

  it('preserves optional colors, UVs, textures and splat bytes with stable content hashes', async () => {
    const asset = meshWorldAsset();

    asset.world.mesh.colors = Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    asset.world.mesh.uvs = Float32Array.from([0, 0, 1, 0, 0, 1]);
    asset.world.mesh.materials[0].image = {
      mimeType: 'image/png',
      bytes: base64ToBytes(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU5kAAAAASUVORK5CYII=',
      ),
      flipY: false,
      wrapS: 'clamp',
      wrapT: 'mirror',
    };
    asset.world.splat = { ...(await splatSpz()), format: 'spz', count: 1 };

    const hash = await hashWorldAsset(asset);
    const restored = await restoreWorldAssets(serializeWorldAssets({ [hash]: asset }));

    expect(restored[hash].world.mesh.colors).toEqual(asset.world.mesh.colors);
    expect(restored[hash].world.mesh.uvs).toEqual(asset.world.mesh.uvs);
    expect(restored[hash].world.mesh.materials[0].image).toEqual(asset.world.mesh.materials[0].image);
    expect(restored[hash].world.splat).toEqual(asset.world.splat);
    expect(await hashWorldAsset(restored[hash])).toBe(hash);
  });

  it('refuses a world without collision pieces and out of bounds indices', async () => {
    const asset = meshWorldAsset();
    const hash = await hashWorldAsset(asset);
    const serialized = serializeWorldAssets({ [hash]: asset });

    serialized[hash].pieces = [];

    await expect(restoreWorldAssets(serialized)).rejects.toThrow();

    const broken = meshWorldAsset();

    broken.world.mesh.indices[0] = 20;

    const badHash = await hashWorldAsset(broken);

    await expect(restoreWorldAssets(serializeWorldAssets({ [badHash]: broken }))).rejects.toThrow();
  });
});
