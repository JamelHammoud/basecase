import { beforeEach, describe, expect, it, vi } from 'vitest';
import { meshWorldAsset } from '../../../cases/worldAssets.fixtures';
import { hashWorldAsset, serializeWorldAssets } from '../../../cases/worldAssets';
import { getScene, listScenes, saveScene, saveScenePreview } from './webScenes';

const data = vi.hoisted(() => new Map<string, unknown>());

vi.mock('./idb', () => ({
  idbGet: async (_store: string, key: string) => data.get(key),
  idbPut: async (_store: string, key: string, value: unknown) => data.set(key, value),
  idbAll: async () => [...data.values()],
  idbDelete: async (_store: string, key: string) => data.delete(key),
}));

beforeEach(() => data.clear());

describe('web scene world persistence', () => {
  it('keeps one portable asset table through a save and preview refresh without adding it to summaries', async () => {
    const asset = meshWorldAsset();
    const hash = await hashWorldAsset(asset);
    const worldAssets = serializeWorldAssets({ [hash]: asset });

    await saveScene({ id: 'world', name: 'Room', parts: [], worldAssets });
    await saveScenePreview({ id: 'world', previewDataUrl: 'data:image/png;base64,AA' });

    expect((await getScene('world'))?.worldAssets).toEqual(worldAssets);
    expect((await listScenes())[0]).not.toHaveProperty('worldAssets');
  });
});
