import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { writeMcap, type FixtureMessage } from '../datasets/import/mcapFixtures';
import { readMcap } from '../datasets/import/recordingFiles';
import { ROS_TO_SCENE } from '../three/viewport/dataFrames';
import { recordingTopics } from '../topics/recordingTopics';
import { TopicCollector } from '../topics/collector';
import { TopicIndex } from '../topics/topicIndex';
import { drawTrack, freshDraw } from './draw';
import { ScanMap } from './map';
import { mapTrack } from './mapClient';
import { topicMap } from './mapFeed';
import {
  CORRIDOR_DRIFT,
  CORRIDOR_SECONDS,
  corridorMcap,
  corridorRanges,
  corridorTruth,
  driftedOdometry,
} from './mapFixtures';
import { depthRoomMessages, ROOM_HALF_M, ROOM_HEIGHT_M, stairMessages, STEP_RISE_M, STEPS } from './mapScenes';
import { MapSession, type PlacedSweep } from './mapSession';
import { pointSink } from './pointSink';

const indexOf = async (messages: Promise<Uint8Array> | Uint8Array) => {
  const [episode] = (await readMcap([{ name: 'map.mcap', bytes: await messages }])).episodes;

  return recordingTopics(episode)!;
};

const mcapOf = (messages: FixtureMessage[]) => writeMcap(messages, { chunked: true });

const closure = (placed: PlacedSweep[]) => {
  const last = placed[placed.length - 1];
  const at = new THREE.Vector3().setFromMatrixPosition(last.pose);
  const truth = corridorTruth(last.at);

  return Math.hypot(at.x - truth.x, at.y - truth.y);
};

const heights = (points: Float32Array) => Array.from({ length: points.length / 3 }, (_, i) => points[i * 3 + 2]);

const near = (values: number[], target: number, within: number) => values.filter((v) => Math.abs(v - target) < within);

let corridor: Awaited<ReturnType<typeof indexOf>>;

beforeAll(async () => {
  corridor = await indexOf(corridorMcap());
});

describe('fusing a robot’s scans into one map', () => {
  it('closes a TurtleBot’s corridor loop within 10 cm with matching on, and drifts more with it off', () => {
    const matched = topicMap(corridor)!;
    const raw = topicMap(corridor, { match: false })!;

    expect(matched.cloud.frame).toBe('odom');
    expect(matched.placed.length).toBeGreaterThan(300);
    expect(closure(matched.placed)).toBeLessThan(0.1);
    expect(closure(raw.placed)).toBeGreaterThan(closure(matched.placed) * 5);
    expect(matched.cloud.points.length).toBeLessThan(raw.cloud.points.length);
  });

  it('builds a room’s floor and walls from an imported depth camera', async () => {
    const built = topicMap(await indexOf(mcapOf(depthRoomMessages())))!;
    const { points } = built.cloud;
    const n = points.length / 3;
    const onSurface = (i: number) => {
      const [x, y, z] = [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];

      return Math.min(
        Math.abs(z),
        Math.abs(ROOM_HEIGHT_M - z),
        Math.abs(ROOM_HALF_M - Math.abs(x)),
        Math.abs(ROOM_HALF_M - Math.abs(y)),
      );
    };
    const floor = near(heights(points), 0, 0.03).length;
    const walls = Array.from({ length: n }, (_, i) => i).filter(
      (i) => Math.max(Math.abs(points[i * 3]), Math.abs(points[i * 3 + 1])) > ROOM_HALF_M - 0.03,
    );

    expect(built.cloud.frame).toBe('map');
    expect(floor).toBeGreaterThan(300);
    expect(walls.length).toBeGreaterThan(1000);
    expect(Math.max(...walls.map((i) => points[i * 3 + 2]))).toBeGreaterThan(1.5);
    expect(Math.max(...Array.from({ length: n }, (_, i) => onSurface(i)))).toBeLessThan(0.03);
  });

  it('builds the steps a quadruped’s point cloud climbs', async () => {
    const built = topicMap(await indexOf(mcapOf(stairMessages())))!;
    const z = heights(built.cloud.points);

    for (let step = 0; step <= STEPS; step++) expect(near(z, step * STEP_RISE_M, 0.02).length).toBeGreaterThan(100);

    expect(built.cloud.low).toBeCloseTo(0, 1);
    expect(built.cloud.high).toBeCloseTo(STEPS * STEP_RISE_M, 1);
  });

  it('grows a live session’s map as its messages arrive', () => {
    const session = new MapSession();
    const odometry = driftedOdometry(CORRIDOR_DRIFT);
    const counts: number[] = [];
    let next = 0;

    session.transform({
      parent: 'base_footprint',
      child: 'base_scan',
      stamp: 0,
      pose: { p: [0, 0, 0.17], q: [0, 0, 0, 1] },
      fixed: true,
    });

    for (let k = 0; k * 0.2 <= CORRIDOR_SECONDS / 2; k++) {
      const at = k * 0.2;

      for (; next < odometry.length && odometry[next].time <= at; next++) {
        const { pose } = odometry[next];

        session.odometry(
          {
            header: { frame_id: 'odom' },
            child_frame_id: 'base_footprint',
            pose: {
              pose: {
                position: { x: pose.x, y: pose.y, z: 0 },
                orientation: { x: 0, y: 0, z: Math.sin(pose.yaw / 2), w: Math.cos(pose.yaw / 2) },
              },
            },
          },
          odometry[next].time,
        );
      }

      session.message(
        'sensor_msgs/LaserScan',
        {
          header: { frame_id: 'base_scan' },
          angle_min: -Math.PI,
          angle_max: Math.PI,
          angle_increment: Math.PI / 180,
          range_min: 0.12,
          range_max: 12,
          ranges: corridorRanges(corridorTruth(at), k),
        },
        { at },
      );
      counts.push(session.map.count);
    }

    expect(counts.every((c, i) => i === 0 || c >= counts[i - 1])).toBe(true);
    expect(counts[counts.length - 1]).toBeGreaterThan(counts[0] * 3);
    expect(session.cloud().frame).toBe('odom');
  });

  it('keeps a ten-minute session under its point cap', () => {
    const cap = 50_000;
    const map = new ScanMap({ cap, match: false });
    const sweep = new Float32Array(500 * 3);

    for (let k = 0; k < 10 * 60 * 5; k++) {
      for (let i = 0; i < 500; i++) sweep.set([((i * 37) % 100) / 10, ((i * 53) % 100) / 10, (i % 7) / 10], i * 3);

      map.add({ points: sweep, pose: new THREE.Matrix4().setPosition(k * 0.1, 0, 0) });
    }

    expect(map.count).toBe(cap);
    expect(map.points()).toHaveLength(cap * 3);
  });

  it('gives the same map for the same try', async () => {
    const index = await indexOf(mcapOf(depthRoomMessages(12)));

    expect(topicMap(index)!.cloud.points).toEqual(topicMap(index)!.cloud.points);
  });

  it('draws as a layer colored by height, placed in the scene', () => {
    const points = Float32Array.from([1, 0, 0, 1, 0, 2]);
    const track = mapTrack({ frame: null, points, low: 0, high: 2 });
    const out = freshDraw(pointSink(16));

    drawTrack(
      track,
      { at: null, tree: { edges: new Map() }, anchors: { links: new Map(), base: null }, colorBy: null },
      out,
    );

    const top = new THREE.Vector3(1, 0, 2).applyMatrix4(ROS_TO_SCENE);

    expect(out.sink.count).toBe(2);
    expect(Array.from(out.sink.positions.slice(3, 6))).toEqual([top.x, top.y, top.z]);
    expect(Array.from(out.sink.colors.slice(0, 3))).not.toEqual(Array.from(out.sink.colors.slice(3, 6)));
  });
});

describe('incomplete map sensors', () => {
  it('keeps valid readings when another sensor topic is missing clipped fields', () => {
    const topics = new TopicCollector();
    const scan = {
      header: { frame_id: 'map' },
      angle_min: 0,
      angle_max: 0,
      angle_increment: 1,
      range_min: 0.1,
      range_max: 10,
      ranges: Float64Array.of(1, 2),
    };

    topics.add('/clipped/scan', 'sensor_msgs/LaserScan', 0n, { header: { frame_id: 'map' } });
    topics.add('/clipped/cloud', 'sensor_msgs/PointCloud2', 0n, { header: { frame_id: 'map' } });
    topics.add('/clipped/cloud-bytes', 'sensor_msgs/PointCloud2', 0n, {
      header: { frame_id: 'map' },
      width: 1,
      height: 1,
      point_step: 12,
      row_step: 12,
      fields: ['x', 'y', 'z'].map((name, i) => ({ name, offset: i * 4, datatype: 7, count: 1 })),
    });
    topics.add('/clipped/depth/image_raw', 'sensor_msgs/Image', 0n, {
      encoding: '16UC1',
      width: 1,
      height: 1,
      step: 2,
    });
    topics.add('/clipped/depth/camera_info', 'sensor_msgs/CameraInfo', 0n, {
      k: Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1),
    });
    topics.add('/unframed', 'sensor_msgs/LaserScan', 0n, { ...scan, header: null });
    topics.add('/valid', 'sensor_msgs/LaserScan', 0n, scan);

    const built = topicMap(new TopicIndex(topics.finish(0n)), { match: false })!;

    expect(built.cloud.frame).toBe('map');
    expect(built.cloud.points).toHaveLength(6);
    expect(built.placed).toHaveLength(1);
  });
});
