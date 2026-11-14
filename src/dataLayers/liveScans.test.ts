import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Eye } from '../sim/eyes';
import type { SimModel } from '../sim/mjcfTypes';
import { DataLayers } from '../three/viewport/dataLayers';
import { LiveScans } from './liveScans';
import { liveScanPoints, scanSources } from './simTracks';
import { DataLayerStore } from './store';

const eye = (part: string, body: string) => ({ part, body, cols: 2, rows: 1 }) as unknown as Eye;

const model = (scans: Eye[]) => ({ scans, bodies: [{ name: 'base' }, { name: 'mast' }] }) as unknown as SimModel;

function drawnStore() {
  const store = new DataLayerStore();
  const layers = new DataLayers(new THREE.Group());
  let redraws = 0;

  store.subscribeDraw(() => {
    if (layers.update(store.input())) redraws++;
  });

  return { store, layers, redraws: () => redraws };
}

describe('live LiDAR scans on the canvas', () => {
  const sources = scanSources(model([eye('lidar', 'base')]), []);
  const scan = (x: number) => liveScanPoints(sources, Float32Array.of(x, 100, 1000, 50, 100, 1000), [2]);

  it('redraws only when a hit moves more than 0.01 mm', () => {
    const { store, layers, redraws } = drawnStore();
    const live = new LiveScans(store);

    live.set(scan(0));
    live.set(scan(0.005));
    expect(redraws()).toBe(1);
    expect(layers.state()[0]).toMatchObject({ visible: true, points: 2 });

    live.set(scan(0.5));
    expect(redraws()).toBe(2);
  });

  it('draws the same hits again after a replay removed the layer', () => {
    const { store, layers } = drawnStore();
    const live = new LiveScans(store);

    live.set(scan(0));
    store.removeTracks(() => true);
    expect(layers.state()).toEqual([]);

    live.set(scan(0));
    expect(layers.state()[0]).toMatchObject({ points: 2 });
  });

  it('gives each LiDAR its own scanner slot’s hits when one is left out', () => {
    const kept = scanSources(model([eye('loose', 'gone'), eye('front', 'base'), eye('top', 'mast')]), []);
    const points = Float32Array.from({ length: 12 }, (_, i) => i);
    const [front, top] = liveScanPoints(kept, points, [1, 2, 1]);

    expect(kept.map((s) => s.slot)).toEqual([1, 2]);
    expect([...front.points]).toEqual([3, 4, 5, 6, 7, 8]);
    expect([...top.points]).toEqual([9, 10, 11]);
  });
});
