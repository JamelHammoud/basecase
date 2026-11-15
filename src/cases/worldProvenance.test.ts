import { describe, expect, it } from 'vitest';
import { readWorldProvenance, MAX_SCAN_CELLS, type ScanWorldProvenance } from './worldProvenance';
import { meshWorldAsset } from './worldAssets.fixtures';
import { hashWorldAsset } from './worldAssets';

const evidence: ScanWorldProvenance = {
  version: 1,
  sourceTry: 'recorded-try',
  frame: 'odom',
  matching: true,
  resolutionM: 0.1,
  method: 'occupied-voxels',
  unknown: 'unobserved',
  occupied: [[10, 0, 2]],
  free: [[0, 0, 2]],
  origins: [[0, 0, 0.2]],
  estimates: { floor: true, obstacleHeightM: 1 },
};

describe('saved scan provenance', () => {
  it('retains evidence and includes the frozen settings and source in the content hash', async () => {
    const asset = meshWorldAsset();

    asset.world.reconstruction = readWorldProvenance(evidence);

    const hash = await hashWorldAsset(asset);
    const changed = { ...asset, world: { ...asset.world, reconstruction: { ...evidence, matching: false } } };
    const otherTry = { ...asset, world: { ...asset.world, reconstruction: { ...evidence, sourceTry: 'another-try' } } };

    expect(asset.world.reconstruction).toEqual(evidence);
    expect(await hashWorldAsset(changed)).not.toBe(hash);
    expect(await hashWorldAsset(otherTry)).not.toBe(hash);
  });

  it('refuses unsupported, non-finite and over-budget evidence when reopening a scene', () => {
    expect(() => readWorldProvenance({ ...evidence, version: 2 })).toThrow();
    expect(() => readWorldProvenance({ ...evidence, origins: [[0, Infinity, 0]] })).toThrow();
    expect(() => readWorldProvenance({ ...evidence, occupied: [[0.5, 0, 0]] })).toThrow();
    expect(() =>
      readWorldProvenance({ ...evidence, free: Array.from({ length: MAX_SCAN_CELLS + 1 }, () => [0, 0, 0]) }),
    ).toThrow();
  });
});
