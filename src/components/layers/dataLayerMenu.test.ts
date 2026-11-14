import { describe, expect, it } from 'vitest';
import { DataLayerStore } from '../../dataLayers/store';
import { listTrack } from '../../dataLayers/track';
import { dataLayerMenu } from './dataLayerMenu';

describe('map layer menu', () => {
  it('turns scan matching off and on through the map row', () => {
    const store = new DataLayerStore();

    store.setTrack(listTrack({ id: 'map', name: 'Map', schema: 'scene/Map' }, []));

    const item = dataLayerMenu(store.rows()[0], store)[0];

    expect(item).toMatchObject({ label: 'Scan Matching', checked: true });

    if (!('onSelect' in item)) throw new Error('Expected matching action');

    item.onSelect?.();
    expect(store.matching()).toBe(false);

    const off = dataLayerMenu(store.rows()[0], store)[0];

    expect(off).toMatchObject({ checked: false });

    if (!('onSelect' in off)) throw new Error('Expected matching action');

    off.onSelect?.();
    expect(store.matching()).toBe(true);
  });
});
