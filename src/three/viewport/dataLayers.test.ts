import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { PointCloud2 } from '../../dataLayers/messages';
import { MAX_POINTS } from '../../dataLayers/pointSink';
import type { DataLayerInput } from '../../dataLayers/store';
import { listTrack, type DataTrack } from '../../dataLayers/track';
import { Hider, hideHelpers } from './captures';
import { linkAnchor } from './dataFrames';
import { DataLayers } from './dataLayers';
import type { ViewportContext } from './viewportContext';

const anchors = { links: new Map([['base_link', linkAnchor([0, 0, 0], [1, 0, 0, 0])]]), base: null };

const input = (tracks: DataTrack[], hidden: string[] = []): DataLayerInput => ({
  tracks,
  hidden: new Set(hidden),
  colorBy: new Map(),
  at: null,
  anchors,
  anchorsVersion: 0,
});

function bigCloud(n: number, shift: number): PointCloud2 {
  const data = new Float32Array(n * 3);

  for (let i = 0; i < n; i++) data.set([(i % 1000) / 100 + shift, Math.floor(i / 1000) / 100, 0], i * 3);

  return {
    header: { frame_id: 'base_link' },
    height: 1,
    width: n,
    fields: ['x', 'y', 'z'].map((name, i) => ({ name, offset: i * 4, datatype: 7, count: 1 })),
    is_bigendian: false,
    point_step: 12,
    row_step: 12 * n,
    data: new Uint8Array(data.buffer),
  };
}

const cloudTrack = (cloud: PointCloud2, version: number) =>
  listTrack({ id: 'cloud', name: '/points', schema: 'sensor_msgs/PointCloud2' }, [{ at: 0, message: cloud }], version);

const scanTrack = (points = Float32Array.of(0, 100, 1000, 50, 100, 1000)) =>
  listTrack({ id: 'scan:lidar', name: 'RPLIDAR', schema: 'scene/Points' }, [{ at: 0, message: { points } }]);

describe('data layers on the canvas', () => {
  it('draws nothing for a hidden layer and comes back when shown', () => {
    const layers = new DataLayers(new THREE.Group());

    layers.update(input([scanTrack()]));
    expect(layers.state()[0]).toMatchObject({ kind: 'scan', visible: true, points: 2 });

    expect(layers.update(input([scanTrack()], ['scan:lidar']))).toBe(true);
    expect(layers.state()[0]).toMatchObject({ visible: false, points: 0 });
    expect(layers.group.children[0].visible).toBe(false);

    layers.update(input([scanTrack()]));
    expect(layers.state()[0]).toMatchObject({ visible: true, points: 2 });
  });

  it('redraws only when a layer’s message changes', () => {
    const layers = new DataLayers(new THREE.Group());
    const track = scanTrack();

    expect(layers.update(input([track]))).toBe(true);
    expect(layers.update(input([track]))).toBe(false);
    expect(layers.update(input([]))).toBe(true);
    expect(layers.state()).toEqual([]);
  });

  it('redraws when another recording replaces a layer at the same playhead', () => {
    const layers = new DataLayers(new THREE.Group());

    layers.update(input([scanTrack()]));

    expect(layers.update(input([scanTrack(Float32Array.of(7, 100, 1000))]))).toBe(true);
    expect(layers.state()[0]).toMatchObject({ visible: true, points: 1 });
  });

  it('updates a million points in one preallocated buffer', () => {
    const layers = new DataLayers(new THREE.Group());
    const first = bigCloud(MAX_POINTS, 0);

    layers.update(input([cloudTrack(first, 1)]));

    const buffer = layers.pointBuffer('cloud');

    expect(layers.state()[0].points).toBe(MAX_POINTS);
    expect(buffer).toHaveLength(MAX_POINTS * 3);

    layers.update(input([cloudTrack(bigCloud(MAX_POINTS, 1), 2)]));

    expect(layers.pointBuffer('cloud')).toBe(buffer);
    expect(buffer![0]).toBeCloseTo(1000);
    expect(layers.state()[0].points).toBe(MAX_POINTS);
  });

  it('never shows in a capture', () => {
    const overlays = new THREE.Group();
    const layers = new DataLayers(overlays);
    const hider = new Hider();

    layers.update(input([scanTrack()]));
    hideHelpers({ stage: { overlays, brushCursor: null } } as unknown as ViewportContext, hider, undefined);

    expect(layers.group.parent).toBe(overlays);
    expect(overlays.visible).toBe(false);
    hider.restore();
    expect(overlays.visible).toBe(true);
  });
});
