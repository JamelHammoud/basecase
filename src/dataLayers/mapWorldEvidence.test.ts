import { Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';
import { MapSession } from './mapSession';
import { MapWorldCells, cellKey } from './mapWorldCells';
import { mapJobs } from './mapJobs';
import { TopicCollector } from '../topics/collector';
import { encodeTopicLog } from '../topics/topicFile';
import type { WorldHull } from '../cases/worldDecomposition';
import { hullBounds } from '../cases/worldSurfaces';
import { reconstructionCloud, reconstructionDepth, reconstructionScan } from './mapWorldSamples';
import { MAX_POINTS } from './pointSink';

const covers = (pieces: WorldHull[], p: number[]) =>
  pieces.some(({ positions }) => {
    const { min, max } = hullBounds(positions);

    return p.every((v, axis) => v >= min[axis] && v <= max[axis]);
  });

describe('scan evidence and open gaps', () => {
  it('keeps an observed table gap free through the mapping worker and shared world preparation', async () => {
    const points: number[] = [];

    for (let x = -2; x <= 2.001; x += 0.1) for (let y = -2; y <= 2.001; y += 0.1) points.push(x, y, 0);

    for (let x = -1; x <= 1.001; x += 0.1) for (let y = -0.5; y <= 0.501; y += 0.1) points.push(x, y, 1);

    for (const x of [-1, 1]) for (const y of [-0.5, 0.5]) for (let z = 0; z <= 1.001; z += 0.1) points.push(x, y, z);

    const topics = new TopicCollector();
    const cloud = Float32Array.from(points);

    topics.add('/points', 'sensor_msgs/PointCloud2', 0n, {
      header: { frame_id: 'map' },
      width: cloud.length / 3,
      height: 1,
      fields: ['x', 'y', 'z'].map((name, i) => ({ name, offset: i * 4, datatype: 7, count: 1 })),
      is_bigendian: false,
      point_step: 12,
      row_step: cloud.byteLength,
      data: new Uint8Array(cloud.buffer),
    });
    topics.add('/tf_static', 'tf2_msgs/TFMessage', 0n, {
      transforms: [
        {
          header: { frame_id: 'map' },
          child_frame_id: 'scanner',
          transform: { translation: { x: 0, y: -2, z: 0.5 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
        },
      ],
    });
    topics.add('/scan', 'sensor_msgs/LaserScan', 0n, {
      header: { frame_id: 'scanner' },
      angle_min: Math.PI / 2,
      angle_max: Math.PI / 2,
      angle_increment: 1,
      range_min: 0.1,
      range_max: 10,
      ranges: Float64Array.of(3),
    });

    const { result } = await mapJobs().makeWorld({
      topics: encodeTopicLog(topics.finish(0n)),
      sourceTry: 'table',
      name: 'Map',
      matching: false,
    });

    if (result.kind !== 'mesh') throw new Error('Expected a mesh world');

    const { pieces, world } = result;

    expect(world.reconstruction!.occupied.length).toBeGreaterThan(200);
    expect(world.reconstruction!.free.some((cell) => cellKey(cell) === '0,0,5')).toBe(true);
    expect(covers(pieces, [0, 400, 0])).toBe(false);
    expect(covers(pieces, [0, 950, 0])).toBe(true);
    expect(world.reconstruction!.estimates.floor).toBe(false);
  });

  it('refuses an out-of-bounds ray origin even when its endpoint lies within the world budget', () => {
    const evidence = new MapWorldCells();

    expect(() =>
      evidence.add({
        at: 0,
        frame: 'map',
        rays: true,
        pose: new Matrix4().setPosition(600, 0, 0),
        points: Float32Array.of(-101, 0, 0),
      }),
    ).toThrow(/500 m/);
  });

  it('rejects a disconnected sensor before its samples enter reconstruction', () => {
    const evidence = new MapWorldCells();
    const session = new MapSession({ match: false }, true, evidence.add);

    session.odometry(
      {
        header: { frame_id: 'odom' },
        child_frame_id: 'base',
        pose: { pose: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } },
      },
      0,
    );
    session.transform({ parent: 'unconnected', child: 'scanner', stamp: 0, pose: { p: [0, 0, 0], q: [0, 0, 0, 1] } });
    expect(session.sweep({ at: 0, frame: 'scanner', rays: true, points: Float32Array.of(1, 0, 0) })).toBe(false);
    expect(evidence.occupied.size).toBe(0);
    expect(evidence.origins).toEqual([]);
  });

  it('refuses oversize sensor frames and depth beyond the decoder range before truncation', () => {
    const header = { frame_id: 'map' };

    expect(() =>
      reconstructionScan({
        header,
        angle_min: 0,
        angle_max: 1,
        angle_increment: 1,
        range_min: 0.1,
        range_max: 10,
        ranges: { length: MAX_POINTS + 1 } as Float32Array,
      }),
    ).toThrow(/budget/);
    expect(() =>
      reconstructionCloud({
        header,
        width: MAX_POINTS + 1,
        height: 1,
        fields: [],
        point_step: 12,
        row_step: 12,
        data: new Uint8Array(),
        is_bigendian: false,
      }),
    ).toThrow(/budget/);
    expect(() =>
      reconstructionDepth(
        {
          width: 1,
          height: 1,
          step: 4,
          encoding: '32FC1',
          is_bigendian: false,
          data: new Uint8Array(Float32Array.of(11).buffer),
        },
        { fx: 1, fy: 1, cx: 0, cy: 0 },
      ),
    ).toThrow(/10 m/);
  });
});
