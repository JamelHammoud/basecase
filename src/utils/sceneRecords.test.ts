import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSettings, SavedSceneRecord } from '../types/robotics';
import { meshWorldAsset } from '../cases/worldAssets.fixtures';
import { getWorldAsset, hashWorldAsset, registerWorldAsset, serializeWorldAssets } from '../cases/worldAssets';
import { loadSceneRecord } from './sceneRecords';

const getScene = vi.hoisted(() => vi.fn());

vi.mock('./platformBridge', () => ({ platformBridge: { getScene } }));
vi.mock('./robotUpgrade', () => ({ upgradeSceneRecord: async () => null }));

beforeEach(() => getScene.mockReset());

const record = (hash: string): SavedSceneRecord => ({
  id: 'world',
  name: 'Room',
  globalGoal: '',
  updatedAt: '',
  partCount: 0,
  parts: [],
  project: {
    cases: [{ world: { objects: [], imported: { hash, position: [0, 0, 0] } } }],
  } as unknown as ProjectSettings,
});

describe('loading saved scene worlds', () => {
  it('restores its world geometry before returning the saved scene', async () => {
    const asset = meshWorldAsset();
    const hash = await hashWorldAsset(asset);
    const scene = { ...record(hash), worldAssets: serializeWorldAssets({ [hash]: asset }) };

    getScene.mockResolvedValue(scene);

    expect(await loadSceneRecord('world')).toEqual(scene);
    expect(getWorldAsset(hash)?.pieces[0].positions).toEqual(asset.pieces[0].positions);
  });

  it('rejects an incomplete saved scene rather than using another scene’s registry entry', async () => {
    const asset = meshWorldAsset();
    const hash = await hashWorldAsset(asset);

    registerWorldAsset(hash, asset);
    getScene.mockResolvedValue(record(hash));

    await expect(loadSceneRecord('world')).rejects.toThrow('missing');
  });
});
