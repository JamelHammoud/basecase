import * as THREE from 'three';
import { resolveFrame, type FrameAnchors, type TfTree } from '../three/viewport/dataFrames';
import { gridPlacement, gridTexels, type GridDraw } from './grid';
import { addEntity, addMarker, liveMarkers, poseMatrix, type FrameOf } from './markers';
import type { Marker, Odometry, RosPose } from './messages';
import { cloudPoints, laserScanPoints, scenePoints } from './points';
import { placer, type PointSink } from './pointSink';
import { addSegment, addStrip, emptyShapes, type Rgba, type Shapes } from './shapes';
import { asTrack, spanAt, type DataTrack, type MessageOf } from './track';
import { treeFrames } from './tf';

export interface DrawContext {
  at: number | null;
  tree: TfTree;
  anchors: FrameAnchors;
  colorBy: string | null;
}

export interface FrameAxes {
  name: string;
  matrix: THREE.Matrix4;
}

export interface LayerDraw {
  sink: PointSink;
  shapes: Shapes;
  grid: GridDraw | null;
  axes: FrameAxes[];
  missing: string | null;
  shownAt: number | null;
}

export const freshDraw = (sink: PointSink): LayerDraw => {
  sink.count = 0;

  return { sink, shapes: emptyShapes(), grid: null, axes: [], missing: null, shownAt: null };
};

const PATH_COLOR: Rgba = [0.05, 0.6, 1, 1];
const AXIS_M = 0.1;
const AXES: Array<{ to: [number, number, number]; color: Rgba }> = [
  { to: [AXIS_M, 0, 0], color: [0.94, 0.27, 0.27, 1] },
  { to: [0, AXIS_M, 0], color: [0.13, 0.77, 0.37, 1] },
  { to: [0, 0, AXIS_M], color: [0.23, 0.51, 0.96, 1] },
];
const POSE_ARROW = { x: 0.3, y: 0.03, z: 0.06 };

function frameResolver(ctx: DrawContext, draw: LayerDraw): FrameOf {
  const memo = new Map<string, THREE.Matrix4 | null>();

  return (frame) => {
    const name = frame.replace(/^\//, '');

    if (!memo.has(name)) {
      memo.set(name, name ? resolveFrame(ctx.tree, name, ctx.at ?? Infinity, ctx.anchors) : ctx.anchors.base);
    }

    const matrix = memo.get(name) ?? null;

    if (!matrix) draw.missing ??= name;

    return matrix;
  };
}

const origin = { x: 0, y: 0, z: 0 };

function addArrow(shapes: Shapes, at: THREE.Matrix4, pose: RosPose) {
  shapes.arrow.push({ matrix: at.clone().multiply(poseMatrix(pose, POSE_ARROW)), color: PATH_COLOR });
}

function drawOdometry(
  track: DataTrack<'nav_msgs/Odometry'>,
  span: { from: number; to: number },
  frameOf: FrameOf,
  draw: LayerDraw,
) {
  const trail: Array<{ x: number; y: number; z: number }> = [];
  let last: Odometry | null = null;

  for (let i = span.from; i <= span.to; i++) {
    const odom = track.message(i);
    const at = frameOf(odom.header.frame_id);

    if (!at) continue;

    const p = odom.pose.pose.position;
    const placed = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(at);

    trail.push({ x: placed.x, y: placed.y, z: placed.z });
    last = odom;
  }

  addStrip(draw.shapes, new THREE.Matrix4(), trail, PATH_COLOR);

  const end = last && frameOf(last.header.frame_id);

  if (last && end) addArrow(draw.shapes, end, last.pose.pose);
}

function drawMarkers(
  track: DataTrack<'visualization_msgs/Marker' | 'visualization_msgs/MarkerArray'>,
  to: number,
  frameOf: FrameOf,
  draw: LayerDraw,
) {
  const all: Marker[] = [];

  for (let i = 0; i <= to; i++) {
    const m = track.message(i);

    if ('markers' in m) all.push(...m.markers);
    else all.push(m);
  }

  for (const marker of liveMarkers(all)) addMarker(draw.shapes, marker, frameOf);
}

function drawFrames(ctx: DrawContext, draw: LayerDraw) {
  for (const name of treeFrames(ctx.tree)) {
    const matrix = resolveFrame(ctx.tree, name, ctx.at ?? Infinity, ctx.anchors);

    if (!matrix) continue;

    draw.axes.push({ name, matrix });

    for (const axis of AXES) {
      addSegment(draw.shapes, matrix, [origin, { x: axis.to[0], y: axis.to[1], z: axis.to[2] }], axis.color);
    }
  }
}

interface Pass {
  frameOf: FrameOf;
  draw: LayerDraw;
  colorBy: string | null;
}

type Drawer = (message: unknown, pass: Pass) => void;

function drawer<S extends DataTrack['schema']>(run: (message: MessageOf<S>, pass: Pass) => void): Drawer {
  return run as Drawer;
}

const DRAWERS: Partial<Record<DataTrack['schema'], Drawer>> = {
  'sensor_msgs/LaserScan': drawer<'sensor_msgs/LaserScan'>((scan, { frameOf, draw, colorBy }) => {
    const at = frameOf(scan.header.frame_id);

    if (at) laserScanPoints(scan, placer(at), draw.sink, colorBy);
  }),
  'sensor_msgs/PointCloud2': drawer<'sensor_msgs/PointCloud2'>((cloud, { frameOf, draw, colorBy }) => {
    const at = frameOf(cloud.header.frame_id);

    if (at) cloudPoints(cloud, placer(at), draw.sink, colorBy);
  }),
  'scene/Points': drawer<'scene/Points'>((cloud, { draw }) => scenePoints(cloud, draw.sink)),
  'foxglove.SceneUpdate': drawer<'foxglove.SceneUpdate'>((update, { frameOf, draw }) => {
    for (const entity of update.entities) addEntity(draw.shapes, entity, frameOf);
  }),
  'nav_msgs/OccupancyGrid': drawer<'nav_msgs/OccupancyGrid'>((grid, { frameOf, draw }) => {
    const at = frameOf(grid.header.frame_id);

    if (!at) return;

    const { width, height } = grid.info;

    draw.grid = { width, height, texels: gridTexels(grid, draw.grid?.texels), placement: gridPlacement(grid, at) };
  }),
  'nav_msgs/Path': drawer<'nav_msgs/Path'>((path, { frameOf, draw }) => {
    const at = frameOf(path.header.frame_id);

    if (at)
      addStrip(
        draw.shapes,
        at,
        path.poses.map((p) => p.pose.position),
        PATH_COLOR,
      );
  }),
  'geometry_msgs/PoseStamped': drawer<'geometry_msgs/PoseStamped'>((pose, { frameOf, draw }) => {
    const at = frameOf(pose.header.frame_id);

    if (at) addArrow(draw.shapes, at, pose.pose);
  }),
};

export function drawTrack(track: DataTrack, ctx: DrawContext, draw: LayerDraw): void {
  const span = spanAt(track, ctx.at);
  const frameOf = frameResolver(ctx, draw);

  if (track.schema === 'tf2_msgs/TFMessage') {
    drawFrames(ctx, draw);

    return;
  }

  if (!span) return;

  draw.shownAt = track.times[span.to];

  if (track.schema === 'nav_msgs/Odometry') {
    drawOdometry(asTrack<'nav_msgs/Odometry'>(track), span, frameOf, draw);

    return;
  }

  if (track.schema === 'visualization_msgs/Marker' || track.schema === 'visualization_msgs/MarkerArray') {
    drawMarkers(asTrack<'visualization_msgs/Marker' | 'visualization_msgs/MarkerArray'>(track), span.to, frameOf, draw);

    return;
  }

  const run = DRAWERS[track.schema];
  const pass = { frameOf, draw, colorBy: ctx.colorBy };

  for (let i = span.from; i <= span.to && run; i++) run(track.message(i), pass);
}
