import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EMPTY_TREE, linkAnchor, tfTree, type FrameAnchors, type TfTree } from '../three/viewport/dataFrames';
import { drawTrack, freshDraw, type DrawContext } from './draw';
import { MARKER, MARKER_DELETE, type LaserScan, type Marker, type PointCloud2 } from './messages';
import { pointSink } from './pointSink';
import { listTrack } from './track';

const YAW_90 = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
const header = (frame_id: string) => ({ frame_id });

function draw(track: Parameters<typeof drawTrack>[0], ctx: Partial<DrawContext> & { anchors: FrameAnchors }) {
  const out = freshDraw(pointSink(10_000));

  drawTrack(track, { at: null, tree: EMPTY_TREE, colorBy: null, ...ctx }, out);

  return out;
}

const pointsOf = (positions: Float32Array, count: number) =>
  Array.from({ length: count }, (_, i) => [0, 1, 2].map((a) => Math.round(positions[i * 3 + a])));

describe('a laser scan in the base frame', () => {
  it('lands on the corridor walls within 10 mm', () => {
    const wall = 1.5;
    const rays = 720;
    const ranges = Array.from({ length: rays }, (_, i) => {
      const angle = -Math.PI + (i * 2 * Math.PI) / rays;

      return Math.abs(Math.sin(angle)) > 0.2 ? wall / Math.abs(Math.sin(angle)) : Infinity;
    });
    const scan: LaserScan = {
      header: header('base_link'),
      angle_min: -Math.PI,
      angle_max: Math.PI,
      angle_increment: (2 * Math.PI) / rays,
      range_min: 0.1,
      range_max: 12,
      ranges,
    };
    const track = listTrack({ id: 'scan', name: '/scan', schema: 'sensor_msgs/LaserScan' }, [{ at: 0, message: scan }]);
    const anchors = { links: new Map([['base_link', linkAnchor([1, 0, 0.2], YAW_90)]]), base: null };
    const out = draw(track, { anchors });
    const xs = pointsOf(out.sink.positions, out.sink.count).map(([x]) => x);

    expect(out.sink.count).toBe(ranges.filter(Number.isFinite).length);
    expect(xs.every((x) => Math.min(Math.abs(x + 500), Math.abs(x - 2500)) < 10)).toBe(true);
    expect(out.missing).toBeNull();
  });
});

function cloud(frame: string, points: Array<[number, number, number, number]>): PointCloud2 {
  const data = new Float32Array(points.flat());

  return {
    header: header(frame),
    height: 1,
    width: points.length,
    fields: ['x', 'y', 'z', 'intensity'].map((name, i) => ({ name, offset: i * 4, datatype: 7, count: 1 })),
    is_bigendian: false,
    point_step: 16,
    row_step: 16 * points.length,
    data: new Uint8Array(data.buffer),
  };
}

describe('a point cloud in a camera frame', () => {
  const tree: TfTree = tfTree([
    { parent: 'wrist_link', child: 'camera_link', stamp: 0, pose: { p: [0.1, 0, 0], q: [0, 0, 0, 1] }, fixed: true },
  ]);
  const wrist = linkAnchor([0.4, 0.2, 0.5], YAW_90);
  const anchors = {
    links: new Map([
      ['base_link', linkAnchor([0, 0, 0], [1, 0, 0, 0])],
      ['wrist_link', wrist],
    ]),
    base: null,
  };
  const track = listTrack({ id: 'depth', name: '/camera/points', schema: 'sensor_msgs/PointCloud2' }, [
    {
      at: 0,
      message: cloud('camera_link', [
        [0, 0, 0, 0],
        [0.1, 0, 0, 5],
        [0, 0.1, 0, 10],
      ]),
    },
  ]);

  it('lands through TF on the wrist link', () => {
    const out = draw(track, { anchors, tree });
    const expected = [
      [0.1, 0, 0],
      [0.2, 0, 0],
      [0.1, 0.1, 0],
    ].map((p) =>
      new THREE.Vector3(...p)
        .applyMatrix4(wrist)
        .toArray()
        .map((v) => Math.round(v)),
    );

    expect(pointsOf(out.sink.positions, out.sink.count)).toEqual(expected);
  });

  it('colors by intensity from the low end of the ramp to the high', () => {
    const out = draw(track, { anchors, tree, colorBy: 'intensity' });
    const first = Array.from(out.sink.colors.subarray(0, 3));
    const last = Array.from(out.sink.colors.subarray(6, 9));

    expect(first).toEqual([48, 18, 59]);
    expect(last).toEqual([122, 4, 3]);
  });

  it('skips a cloud in a frame it can’t resolve and flags the frame', () => {
    const lost = listTrack({ id: 'lost', name: '/lost', schema: 'sensor_msgs/PointCloud2' }, [
      { at: 0, message: cloud('gripper_cam', [[0, 0, 0, 1]]) },
    ]);
    const out = draw(lost, { anchors, tree });

    expect(out.sink.count).toBe(0);
    expect(out.missing).toBe('gripper_cam');
  });
});

const marker = (id: number, type: number, extra: Partial<Marker> = {}): Marker => ({
  header: header('base_link'),
  ns: 'test',
  id,
  type,
  action: 0,
  pose: { position: { x: id, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
  scale: { x: 0.1, y: 0.1, z: 0.1 },
  color: { r: 1, g: 0.5, b: 0, a: 1 },
  ...extra,
});

const line = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: 0, z: 0 }));

describe('markers', () => {
  it('draws a MarkerArray’s cubes and lines, and drops a deleted one', () => {
    const anchors = { links: new Map([['base_link', linkAnchor([0, 0, 0], [1, 0, 0, 0])]]), base: null };
    const track = listTrack({ id: 'm', name: '/markers', schema: 'visualization_msgs/MarkerArray' }, [
      {
        at: 0,
        message: {
          markers: [
            marker(1, MARKER.cube),
            marker(2, MARKER.cube),
            marker(3, MARKER.cube),
            marker(4, MARKER.cubeList, { points: line(4) }),
            marker(5, MARKER.lineStrip, { points: line(4) }),
            marker(6, MARKER.lineList, { points: line(4) }),
          ],
        },
      },
      { at: 1, message: { markers: [marker(2, MARKER.cube, { action: MARKER_DELETE })] } },
    ]);
    const out = draw(track, { anchors });

    expect(out.shapes.cube).toHaveLength(6);
    expect(out.shapes.lines.length / 6).toBe(5);
    expect(out.shapes.cube[0].color).toEqual([1, 0.5, 0, 1]);
    expect(draw(track, { anchors, at: 0.5 }).shapes.cube).toHaveLength(7);
  });
});

describe('an occupancy grid', () => {
  it('maps unknown, free and occupied cells to the texture and spans its cells', () => {
    const anchors = { links: new Map([['map', linkAnchor([0, 0, 0], [1, 0, 0, 0])]]), base: null };
    const track = listTrack({ id: 'g', name: '/map', schema: 'nav_msgs/OccupancyGrid' }, [
      {
        at: 0,
        message: {
          header: header('map'),
          info: {
            resolution: 0.05,
            width: 2,
            height: 2,
            origin: { position: { x: -1, y: -1, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
          },
          data: [-1, 0, 50, 100],
        },
      },
    ]);
    const { grid } = draw(track, { anchors });
    const corner = new THREE.Vector3(1, 1, 0).applyMatrix4(grid!.placement);

    expect(Array.from(grid!.texels)).toEqual([0, 0, 0, 0, 0, 0, 0, 64, 128, 128, 128, 160, 255, 255, 255, 255]);
    expect(corner.toArray().map((v) => Math.round(v))).toEqual([-900, 0, 900]);
  });
});
