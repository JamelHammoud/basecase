import { describe, expect, it } from 'vitest';
import { bytesToBase64 } from '../utils/base64';
import { getWorldAsset, hashWorldAsset, restoreWorldAssets, serializeWorldAssets } from './worldAssets';
import { meshWorldAsset } from './worldAssets.fixtures';
import { splatPly, splatSpz } from './worldImport/fixtures';
import { readSplat } from './worldImport/splat';

function imageHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x89504e47);
  view.setUint32(4, 0x0d0a1a0a);
  view.setUint32(12, 0x49484452);
  view.setUint32(16, width);
  view.setUint32(20, height);

  return bytes;
}

describe('restored world payloads', () => {
  it('refuses matching-hash ASCII PLY that Spark cannot decode and restores imported binary PLY', async () => {
    const file = splatPly();
    const asset = meshWorldAsset();

    asset.world.splat = { ...file, count: 1, format: 'ply' };

    const rawHash = await hashWorldAsset(asset);

    await expect(restoreWorldAssets(serializeWorldAssets({ [rawHash]: asset }))).rejects.toThrow('binary PLY');
    expect(getWorldAsset(rawHash)).toBeUndefined();

    const imported = meshWorldAsset();

    imported.world.splat = await readSplat(file);

    const importedHash = await hashWorldAsset(imported);
    const restored = await restoreWorldAssets(serializeWorldAssets({ [importedHash]: imported }));

    expect(restored[importedHash].world.splat).toEqual(imported.world.splat);
  });

  it('refuses oversized and nonfinite splat bytes even under their correct content hashes', async () => {
    const files = [splatPly('0', 1_000_001), splatPly('NaN'), await splatSpz(1_000_001)];

    for (const file of files) {
      const asset = meshWorldAsset();

      asset.world.splat = { ...file, count: 1, format: file.name.endsWith('.spz') ? 'spz' : 'ply' };

      const hash = await hashWorldAsset(asset);

      await expect(restoreWorldAssets(serializeWorldAssets({ [hash]: asset }))).rejects.toThrow();
      expect(getWorldAsset(hash)).toBeUndefined();
    }
  });

  it('compares declared splat counts and formats with the actual encoded payload', async () => {
    const file = splatPly();

    for (const metadata of [
      { count: 2, format: 'ply' as const },
      { count: 1, format: 'spz' as const },
    ]) {
      const asset = meshWorldAsset();

      asset.world.splat = { ...file, ...metadata };

      const hash = await hashWorldAsset(asset);

      await expect(restoreWorldAssets(serializeWorldAssets({ [hash]: asset }))).rejects.toThrow('metadata');
    }
  });

  it('refuses texture dimensions, total decoded pixels and MIME mismatches despite matching hashes', async () => {
    const huge = imageHeader(8193, 1);
    const quarter = imageHeader(4096, 4096);
    const images = [
      [{ mimeType: 'image/png', bytes: huge }],
      [{ mimeType: 'image/jpeg', bytes: imageHeader(1, 1) }],
      [
        { mimeType: 'image/png', bytes: quarter },
        { mimeType: 'image/png', bytes: quarter },
      ],
    ];

    for (const materialImages of images) {
      const asset = meshWorldAsset();

      asset.world.mesh.materials = materialImages.map((image) => ({ ...asset.world.mesh.materials[0], image }));

      const hash = await hashWorldAsset(asset);

      await expect(restoreWorldAssets(serializeWorldAssets({ [hash]: asset }))).rejects.toThrow('texture');
      expect(getWorldAsset(hash)).toBeUndefined();
    }
  });

  it('registers no earlier assets when a later payload fails validation', async () => {
    const valid = meshWorldAsset();

    valid.world.name = 'Pending payload validation';

    const firstHash = await hashWorldAsset(valid);
    const invalid = meshWorldAsset();

    invalid.world.mesh.materials[0].image = { mimeType: 'image/png', bytes: imageHeader(9000, 9000) };

    const lastHash = await hashWorldAsset(invalid);
    const table = serializeWorldAssets({ [firstHash]: valid, [lastHash]: invalid });

    expect(table[lastHash].world.mesh.materials[0].image?.bytes).toBe(bytesToBase64(imageHeader(9000, 9000)));
    await expect(restoreWorldAssets(table)).rejects.toThrow('texture');
    expect(getWorldAsset(firstHash)).toBeUndefined();
    expect(getWorldAsset(lastHash)).toBeUndefined();
  });
});
