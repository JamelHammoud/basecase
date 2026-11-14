import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mapTrack } from '../../dataLayers/mapClient';
import { mapCloud } from '../../dataLayers/map';
import { DataLayers } from './dataLayers';
import { listTrack } from '../../dataLayers/track';

describe('the fused map layer', () => {
  it('stays complete and fixed in the world while the robot and playhead move', () => {
    const layers = new DataLayers(new THREE.Group());
    const cloud = mapCloud(Float32Array.of(1, 2, 3, 4, 5, 6), 'odom');
    const map = mapTrack(cloud);
    const tf = listTrack({ id: 'tf', name: '/tf', schema: 'tf2_msgs/TFMessage' }, [
      {
        at: 0,
        message: {
          transforms: [
            {
              header: { frame_id: 'odom' },
              child_frame_id: 'base_link',
              transform: { translation: { x: 1, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
            },
          ],
        },
      },
    ]);
    const input = {
      tracks: [map, tf],
      hidden: new Set<string>(),
      colorBy: new Map<string, string>(),
      at: 0,
      anchors: { links: new Map([['base_link', new THREE.Matrix4()]]), base: new THREE.Matrix4() },
      anchorsVersion: 0,
    };

    layers.update(input);

    const first = Array.from(layers.pointBuffer(map.id)!.slice(0, 6));

    expect(first).toEqual([1000, 3000, -2000, 4000, 6000, -5000]);
    expect(layers.state().find((s) => s.id === map.id)?.points).toBe(2);
    layers.update({ ...input, at: 9, anchorsVersion: 1 });
    expect(Array.from(layers.pointBuffer(map.id)!.slice(0, 6))).toEqual(first);
    layers.dispose();
  });
});
