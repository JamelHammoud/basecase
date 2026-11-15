import { describe, expect, it, vi } from 'vitest';
import { meshWorldAsset } from '../cases/worldAssets.fixtures';
import { DataLayerStore } from '../dataLayers/store';
import { mapTrack } from '../dataLayers/mapClient';
import { dataLayerMenu } from '../components/layers/dataLayerMenu';
import { mapWorldAction } from './mapWorldAction';

vi.mock('../dataLayers/mapClient', async (original) => ({
  ...(await original<typeof import('../dataLayers/mapClient')>()),
  makeMapWorld: vi.fn(),
}));

import { makeMapWorld } from '../dataLayers/mapClient';

describe('Make World entry', () => {
  it('freezes the recording, source and matching choice at the click', async () => {
    const store = new DataLayerStore();
    const topics = Uint8Array.of(1, 2);
    const ready = vi.fn();
    const failed = vi.fn();
    const prepared = { kind: 'mesh' as const, hash: 'a'.repeat(64), ...meshWorldAsset(), serializedJson: '{}' };

    vi.mocked(makeMapWorld).mockResolvedValue(prepared);
    store.setTrack(mapTrack({ frame: 'map', points: Float32Array.of(1, 2, 3), low: 3, high: 3 }));
    store.setWorldMaker(
      mapWorldAction({ topics, sourceTry: 'try-one', name: 'Corridor', matching: true }, { ready, failed }),
    );

    const action = dataLayerMenu(store.rows()[0], store).find((item) => 'label' in item && item.label === 'Make World');

    if (!action || !('onSelect' in action)) throw new Error('Missing Make World action');

    action.onSelect?.();
    store.setMatching(false);
    store.removeTracks(() => true);
    await vi.waitFor(() => expect(ready).toHaveBeenCalledWith(prepared));
    expect(makeMapWorld).toHaveBeenCalledWith({ topics, sourceTry: 'try-one', name: 'Corridor', matching: true });
    expect(failed).not.toHaveBeenCalled();
  });

  it('leaves the current Case alone when reconstruction is refused', async () => {
    const ready = vi.fn();
    const failed = vi.fn();

    vi.mocked(makeMapWorld).mockRejectedValue(new Error('Scan reconstruction exceeds its observed cell budget'));
    mapWorldAction(
      { topics: Uint8Array.of(1), sourceTry: 'try-one', name: 'Corridor', matching: false },
      { ready, failed },
    )();
    await vi.waitFor(() => expect(failed).toHaveBeenCalled());
    expect(ready).not.toHaveBeenCalled();
  });
});
