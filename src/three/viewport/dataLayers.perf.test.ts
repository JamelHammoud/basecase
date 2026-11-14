import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { PointCloud2 } from '../../dataLayers/messages';
import { MAX_POINTS } from '../../dataLayers/pointSink';
import type { DataLayerInput } from '../../dataLayers/store';
import { listTrack, type DataTrack } from '../../dataLayers/track';
import { linkAnchor } from './dataFrames';
import { DataLayers } from './dataLayers';

const FRAME_MS = 16;
const RUNS = 8;

const anchors = { links: new Map([['base_link', linkAnchor([0, 0, 0], [1, 0, 0, 0])]]), base: null };

const input = (tracks: DataTrack[], colorBy: string | null): DataLayerInput => ({
  tracks,
  hidden: new Set(),
  colorBy: new Map(colorBy ? [['cloud', colorBy]] : []),
  at: null,
  anchors,
  anchorsVersion: 0,
});

function cloud(shift: number): PointCloud2 {
  const data = new Float32Array(MAX_POINTS * 4);

  for (let i = 0; i < MAX_POINTS; i++)
    data.set([(i % 1000) / 100 + shift, Math.floor(i / 1000) / 100, 0, i % 255], i * 4);

  return {
    header: { frame_id: 'base_link' },
    height: 1,
    width: MAX_POINTS,
    fields: ['x', 'y', 'z', 'intensity'].map((name, i) => ({ name, offset: i * 4, datatype: 7, count: 1 })),
    is_bigendian: false,
    point_step: 16,
    row_step: 16 * MAX_POINTS,
    data: new Uint8Array(data.buffer),
  };
}

const track = (message: PointCloud2, version: number) =>
  listTrack({ id: 'cloud', name: '/points', schema: 'sensor_msgs/PointCloud2' }, [{ at: 0, message }], version);

function fastest(colorBy: string | null) {
  const layers = new DataLayers(new THREE.Group());
  const clouds = [cloud(0), cloud(1)];
  const times: number[] = [];
  let last = track(clouds[1], 0);

  layers.update(input([last], colorBy));

  for (let i = 1; i <= RUNS; i++) {
    last = track(clouds[i % 2], i);

    const started = performance.now();

    layers.update(input([last], colorBy));
    times.push(performance.now() - started);
  }

  const idle = performance.now();

  layers.update(input([last], colorBy));

  return { update: Math.min(...times), idle: performance.now() - idle };
}

describe('a million-point cloud', () => {
  it('rewrites its buffer within a frame and costs nothing when unchanged', () => {
    const solid = fastest(null);
    const shaded = fastest('intensity');

    expect(solid.update).toBeLessThan(FRAME_MS);
    expect(shaded.update).toBeLessThan(FRAME_MS * 1.5);
    expect(solid.idle).toBeLessThan(1);
  });
});
