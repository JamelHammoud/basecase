import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mapCloud, mapSummary, ScanMap } from './map';
import { structureAt } from './mapMatch';
import { MAP_FRAME_SAMPLES, MAP_PLACED_SWEEPS, MapSession } from './mapSession';
import { cloudSweep, depthSweep, intrinsicsOf, type DepthImage } from './mapSweeps';
import { MAP_VOXEL_M, Voxels } from './voxels';

describe('map voxels', () => {
  it('keeps the worker’s bounds on the map summary', () => {
    const cloud = mapCloud(Float32Array.from([1, 2, 3, 4, 5, 6]), 'map');

    expect(mapSummary(cloud).bounds).toBe(cloud.bounds);
    expect(cloud.bounds).toEqual({ min: [1, 2, 3], max: [4, 5, 6] });
  });

  it('uses 5 cm cells and averages every return in each occupied cell', () => {
    const map = new ScanMap({ match: false });

    map.add({
      points: Float32Array.from([0.01, 0.01, 0.01, 0.03, 0.03, 0.03, -0.01, 0, 0]),
      pose: new THREE.Matrix4(),
    });
    expect(map.voxels.size).toBe(MAP_VOXEL_M);
    expect(map.count).toBe(2);
    expect(map.points()[0]).toBeCloseTo(0.02);
    expect(map.points()[3]).toBeCloseTo(-0.01);
  });

  it('packs neighbouring cells exactly at both ends of its supported range', () => {
    const voxels = new Voxels(0.05, 16);
    const cells = [-65536, -65535, 0, 65534, 65535];
    const keys = cells.flatMap((x) => cells.flatMap((y) => cells.map((z) => voxels.keyOf(x, y, z))));

    expect(keys.every(Number.isSafeInteger)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(voxels.keyOf(-65537, 0, 0)).toBe(-1);
    expect(voxels.keyOf(65536, 0, 0)).toBe(-1);
  });

  it('keeps averaging existing cells when full and rejects nonfinite returns', () => {
    const voxels = new Voxels(1, 1);

    voxels.add(0.1, 0.2, 0.3);
    voxels.add(3, 4, 5);
    voxels.add(0.3, 0.4, 0.5);
    voxels.add(NaN, 0, 0);
    voxels.add(0, Infinity, 0);
    expect(voxels.count).toBe(1);
    expect(voxels.points()[0]).toBeCloseTo(0.2);
  });

  it('reports updated centroids once per touched cell and clears the changes', () => {
    const voxels = new Voxels(1, 2, true);

    voxels.add(0.1, 0, 0);
    voxels.add(0.3, 0, 0);
    voxels.add(1.1, 0, 0);

    const first = voxels.takeChanges();

    expect(Array.from(first.indices)).toEqual([0, 1]);
    expect(first.points[0]).toBeCloseTo(0.2);
    expect(voxels.takeChanges().indices).toHaveLength(0);
    voxels.add(0.8, 0, 0);
    voxels.add(2, 0, 0);

    const next = voxels.takeChanges();

    expect(Array.from(next.indices)).toEqual([0]);
    expect(next.points[0]).toBeCloseTo(0.4);
  });

  it.each([0, -1, Infinity, NaN])('rejects a voxel width of %s', (size) => {
    expect(() => new Voxels(size, 10)).toThrow(RangeError);
  });

  it.each([0, -1, 0.5, Infinity, NaN])('rejects a point cap of %s', (cap) => {
    expect(() => new Voxels(0.05, cap)).toThrow(RangeError);
  });
});

describe('point-to-plane matching', () => {
  it.each([0, Math.PI / 4])('keeps both line normals perpendicular for a scan tilted by %s', (angle) => {
    const voxels = new Voxels(0.05, 100);
    const tangent = new THREE.Vector3(1, 0.6 * Math.cos(angle), 0.6 * Math.sin(angle)).normalize();

    for (let i = -20; i <= 20; i++)
      voxels.add(i * 0.005, i * 0.003 * Math.cos(angle), 0.17 + i * 0.003 * Math.sin(angle));

    const structure = structureAt(voxels, voxels.at(0, 0, 3), true);

    expect(structure.normals).toHaveLength(6);

    for (let i = 0; i < 6; i += 3) {
      const normal = new THREE.Vector3().fromArray(structure.normals, i);

      expect(normal.length()).toBeCloseTo(1, 10);
      expect(normal.dot(tangent)).toBeCloseTo(0, 10);
    }
  });

  it('corrects motion normal to a plane and preserves its unconstrained translation', () => {
    const points = Float32Array.from(
      Array.from({ length: 6400 }, (_, i) => [(i % 80) * 0.025, Math.floor(i / 80) * 0.025, 0]).flat(),
    );
    const map = new ScanMap();

    map.add({ points, pose: new THREE.Matrix4() });

    const placed = map.add({ points, pose: new THREE.Matrix4().setPosition(0.02, 0.01, 0.04) });

    expect(placed.elements[14]).toBeCloseTo(0, 2);
    expect(placed.elements[12]).toBeCloseTo(0.02, 4);
    expect(placed.elements[13]).toBeCloseTo(0.01, 4);
  });

  it('keeps the given pose when returns cannot constrain a match', () => {
    const map = new ScanMap();
    const points = Float32Array.from([1, 2, 3]);
    const pose = new THREE.Matrix4().setPosition(0.02, 0.01, 0.04);

    map.add({ points, pose: new THREE.Matrix4() });
    expect(map.add({ points, pose }).elements).toEqual(pose.elements);
  });
});

describe('placing map sweeps', () => {
  it('omits a cyclic transform chain', () => {
    const session = new MapSession({ match: false });

    session.transform({ parent: 'base', child: 'laser', stamp: 0, pose: { p: [1, 0, 0], q: [0, 0, 0, 1] } });
    session.transform({ parent: 'laser', child: 'base', stamp: 0, pose: { p: [1, 0, 0], q: [0, 0, 0, 1] } });
    expect(session.sweep({ at: 0, frame: 'laser', points: Float32Array.from([1, 0, 0]) })).toBe(false);
    expect(session.frame).toBeNull();
    expect(session.map.count).toBe(0);
  });

  it('omits a disconnected sensor rather than guessing its mounting pose', () => {
    const session = new MapSession({ match: false });

    session.message(
      'nav_msgs/Odometry',
      {
        header: { frame_id: 'odom' },
        child_frame_id: 'base',
        pose: { pose: { position: { x: 1, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } },
      },
      { at: 0 },
    );
    expect(session.sweep({ at: 0, frame: 'camera', points: Float32Array.from([1, 0, 0]), optical: true })).toBe(false);
    expect(session.frame).toBeNull();
    expect(session.map.count).toBe(0);
  });

  it('bounds a live session’s transform and placement history', () => {
    const session = new MapSession({ match: false });
    const points = Float32Array.from([1, 0, 0]);

    for (let stamp = 0; stamp < MAP_PLACED_SWEEPS + 10; stamp++) {
      session.transform({ parent: 'map', child: 'laser', stamp, pose: { p: [0, 0, 0], q: [0, 0, 0, 1] } });
      session.sweep({ at: stamp, frame: 'laser', points });
    }

    expect(session.transformSamples).toBe(MAP_FRAME_SAMPLES);
    expect(session.placed).toHaveLength(MAP_PLACED_SWEEPS);
    expect(session.placed[0].at).toBe(10);
    expect(session.map.count).toBe(1);
  });

  it('omits a sensor subtree disconnected from odometry without claiming the map frame', () => {
    const session = new MapSession({ match: false });

    session.odometry(
      {
        header: { frame_id: 'odom' },
        child_frame_id: 'base',
        pose: { pose: { position: { x: 2, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } },
      },
      0,
    );
    session.transform({ parent: 'unconnected', child: 'camera', stamp: 0, pose: { p: [1, 0, 0], q: [0, 0, 0, 1] } });
    session.transform({ parent: 'base', child: 'laser', stamp: 0, pose: { p: [0, 0, 0], q: [0, 0, 0, 1] } });
    expect(session.sweep({ at: 0, frame: 'camera', optical: true, points: Float32Array.of(1, 0, 0) })).toBe(false);
    expect(session.frame).toBeNull();
    expect(session.sweep({ at: 0, frame: 'laser', points: Float32Array.of(1, 0, 0) })).toBe(true);
    expect(session.sweep({ at: 0, frame: 'odom', points: Float32Array.of(4, 0, 0) })).toBe(true);
    expect(session.cloud().frame).toBe('odom');
    expect(Array.from(session.cloud().points)).toEqual([3, 0, 0, 4, 0, 0]);
  });

  it('does not fix the map frame from an empty sensor message', () => {
    const session = new MapSession({ match: false });

    expect(session.sweep({ at: 0, frame: 'unused', points: new Float32Array() })).toBe(false);
    expect(session.frame).toBeNull();
    expect(session.sweep({ at: 1, frame: 'map', points: Float32Array.from([1, 2, 3]) })).toBe(true);
    expect(session.cloud().frame).toBe('map');
  });

  it('interpolates a TF pose and composes the fixed sensor extrinsic', () => {
    const session = new MapSession({ match: false });

    for (const stamp of [0, 2])
      session.transform({ parent: 'map', child: 'base', stamp, pose: { p: [stamp, 0, 0], q: [0, 0, 0, 1] } });

    session.transform({
      parent: 'base',
      child: 'laser',
      stamp: 0,
      fixed: true,
      pose: { p: [0, 0, 0.3], q: [0, 0, 0, 1] },
    });
    session.sweep({ at: 1, frame: 'laser', points: Float32Array.from([1, 0, 0]) });
    expect(Array.from(session.cloud().points)).toEqual([2, 0, expect.closeTo(0.3)]);
    expect(session.frame).toBe('map');
  });

  it('rejects a sweep rooted in a disconnected frame', () => {
    const session = new MapSession({ match: false });

    session.sweep({ at: 0, frame: 'map', points: Float32Array.from([1, 0, 0]) });
    expect(session.sweep({ at: 1, frame: 'other', points: Float32Array.from([2, 0, 0]) })).toBe(false);
    expect(session.map.count).toBe(1);
  });
});

describe('organized point clouds', () => {
  it('reads rows with padding and keeps only complete available points', () => {
    const values = Float32Array.from([1, 2, 3, 4, 5, 6, 999, 999, 7, 8, 9]);
    const cloud = {
      header: { frame_id: 'map' },
      width: 2,
      height: 2,
      point_step: 12,
      row_step: 32,
      is_bigendian: false,
      fields: ['x', 'y', 'z'].map((name, i) => ({ name, offset: i * 4, datatype: 7, count: 1 })),
      data: new Uint8Array(values.buffer),
    };

    expect(Array.from(cloudSweep(cloud))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('bounds allocation by the data instead of the declared dimensions', () => {
    const cloud = {
      header: { frame_id: 'map' },
      width: 1_000_000_000,
      height: 1_000_000_000,
      point_step: 12,
      row_step: 12_000_000_000,
      is_bigendian: false,
      fields: ['x', 'y', 'z'].map((name, i) => ({ name, offset: i * 4, datatype: 7, count: 1 })),
      data: new Uint8Array(Float32Array.from([1, 2, 3]).buffer),
    };

    expect(Array.from(cloudSweep(cloud))).toEqual([1, 2, 3]);
  });
});

describe('depth returns', () => {
  it('bounds a depth image by its available bytes', () => {
    const image: DepthImage = {
      width: 1,
      height: 1_000_000_000,
      step: 2,
      encoding: '16UC1',
      is_bigendian: true,
      data: Uint8Array.from([0x03, 0xe8]),
    };

    expect(Array.from(depthSweep(image, { fx: 1, fy: 1, cx: 0, cy: 0 }))).toEqual([0, 0, 1]);
  });

  it('rejects a zero depth stride before reading the image', () => {
    const image: DepthImage = {
      width: 1,
      height: 1,
      step: 2,
      encoding: '16UC1',
      is_bigendian: false,
      data: new Uint8Array(2),
    };

    expect(() => depthSweep(image, { fx: 1, fy: 1, cx: 0, cy: 0 }, 0)).toThrow(RangeError);
  });

  it('rejects nonfinite calibration values', () => {
    for (const k of [
      [NaN, 0, 0, 0, 1, 0],
      [1, 0, 0, 0, Infinity, 0],
      [1, 0, NaN, 0, 1, 0],
    ])
      expect(intrinsicsOf(k)).toBeNull();
  });

  it('reads padded big-endian millimetre depth and drops zero returns', () => {
    const data = Uint8Array.from([0x03, 0xe8, 0, 0, 0xff, 0xff, 0x07, 0xd0, 0x0b, 0xb8, 0xff, 0xff]);
    const image: DepthImage = { width: 2, height: 2, step: 6, encoding: '16UC1', is_bigendian: true, data };
    const points = depthSweep(image, { fx: 1, fy: 1, cx: 0, cy: 0 }, 1);

    expect(Array.from(points)).toEqual([0, 0, 1, 0, 2, 2, 3, 3, 3]);
  });
});
