import { describe, expect, it, vi } from 'vitest';
import { DataLayerStore } from './store';
import { listTrack } from './track';

const mapTrack = () => listTrack({ id: 'map', name: 'Map', schema: 'scene/Map' }, []);

describe('map layer settings', () => {
  it('starts with matching enabled and keeps that choice when map tracks are replaced', () => {
    const store = new DataLayerStore();
    const changed = vi.fn();

    store.subscribe(changed);
    store.setTrack(mapTrack());
    expect(store.matching()).toBe(true);
    expect(store.rows()[0]).toMatchObject({ matching: true, visible: true });
    store.setMatching(false);
    expect(store.matching()).toBe(false);
    expect(store.rows()[0]).toMatchObject({ matching: false });
    expect(changed).toHaveBeenCalledTimes(2);
    store.setMatching(false);
    expect(changed).toHaveBeenCalledTimes(2);
    store.removeTracks(() => true);
    store.setTrack(mapTrack());
    expect(store.rows()[0]).toMatchObject({ matching: false });
  });

  it('uses the existing visibility control independently of scan matching', () => {
    const store = new DataLayerStore();

    store.setTrack(mapTrack());
    store.setVisible('map', false);
    expect(store.rows()[0]).toMatchObject({ visible: false, matching: true });
    expect(store.input().hidden.has('map')).toBe(true);
    store.setMatching(false);
    store.setVisible('map', true);
    expect(store.rows()[0]).toMatchObject({ visible: true, matching: false });
  });
});
