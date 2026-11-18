import { freshDraw, drawTrack, type LayerDraw } from '../../dataLayers/draw';
import { SHAPE_KINDS, type ShapeKind, type Rgba } from '../../dataLayers/shapes';
import { pointSink } from '../../dataLayers/pointSink';
import { lastAtOrBefore, type DataTrack } from '../../dataLayers/track';
import { ROS_TO_SCENE } from '../../three/viewport/dataFrames';
import { treeAt } from '../../dataLayers/tf';
import { DATA_LAYER_SCHEMAS } from '../../topics/schemas';
import { topicTracks } from '../../topics/topicTracks';
import type { ComparisonSource } from './comparison';

const LIMIT = 4096;
const SUPPORTED = new Set(DATA_LAYER_SCHEMAS.values());

export interface SpatialSnapshot {
  at: number | null;
  frame: string;
  missing: string | null;
  points: number[];
  lines: number[];
  shapes: Array<{ kind: ShapeKind; matrix: number[]; color: Rgba }>;
  grid: { width: number; height: number; texels: Uint8Array; matrix: number[] } | null;
  clipped: boolean;
}

const empty = (missing: string | null): SpatialSnapshot => ({
  at: null,
  frame: '',
  missing,
  points: [],
  lines: [],
  shapes: [],
  grid: null,
  clipped: false,
});

function spatialFrame(track: DataTrack, i: number, tracks: DataTrack[], time: number): SpatialSnapshot {
  const message = track.message(i);
  const frame = messageFrame(message);

  if (!frame) return empty('Unmatched frame');

  if (largeGrid(track.schema, message)) return empty('Geometry limit');

  const draw = freshDraw(pointSink(LIMIT));
  const single: DataTrack = { ...track, times: [track.times[i]], message: () => message };

  const visible = track.schema === 'nav_msgs/Odometry' ? single : track;

  drawTrack(
    visible,
    {
      at: track.times[i],
      tree: treeAt(tracks, time),
      colorBy: null,
      anchors: { links: new Map([[frame, ROS_TO_SCENE]]), base: null },
    },
    draw,
  );

  if (draw.missing) return empty('Unmatched frame');

  return packedDraw(draw, frame, track.times[i]);
}

function messageFrame(message: unknown) {
  const headers = message as {
    header?: { frame_id?: string };
    markers?: Array<{ header?: { frame_id?: string } }>;
    transforms?: Array<{ header?: { frame_id?: string } }>;
    entities?: Array<{ frame_id?: string }>;
  };
  const header = headers.header ??
    headers.markers?.[0]?.header ??
    headers.transforms?.[0]?.header ?? { frame_id: headers.entities?.[0]?.frame_id };
  const frame = header?.frame_id?.replace(/^\//u, '') ?? '';

  return frame;
}

function largeGrid(schema: string, message: unknown) {
  const grid = message as { info?: { width: number; height: number } };

  return schema === 'nav_msgs/OccupancyGrid' && (grid.info?.width ?? 0) * (grid.info?.height ?? 0) > 1024 * 1024;
}

function packedDraw(draw: LayerDraw, frame: string, at: number): SpatialSnapshot {
  return {
    at,
    frame,
    missing: null,
    points: Array.from(draw.sink.positions.subarray(0, draw.sink.count * 3)),
    lines: draw.shapes.lines.slice(0, LIMIT * 6),
    shapes: SHAPE_KINDS.flatMap((kind) =>
      draw.shapes[kind].slice(0, 64).map((shape) => ({ kind, matrix: shape.matrix.elements, color: shape.color })),
    ),
    grid: draw.grid && {
      width: draw.grid.width,
      height: draw.grid.height,
      texels: draw.grid.texels,
      matrix: draw.grid.placement.elements,
    },
    clipped:
      draw.sink.count === LIMIT ||
      draw.shapes.lines.length > LIMIT * 6 ||
      SHAPE_KINDS.some((kind) => draw.shapes[kind].length > 64),
  };
}

export function comparisonSpatialSession() {
  const tracks = new WeakMap<ComparisonSource, DataTrack[]>();
  const cache = new Map<string, SpatialSnapshot>();

  return {
    read(source: ComparisonSource, topic: string, time: number): SpatialSnapshot {
      const list = tracks.get(source) ?? topicTracks(source.index);

      tracks.set(source, list);

      const track = list.find((candidate) => candidate.name === topic);
      const i = track ? lastAtOrBefore(track.times, time) : -1;

      if (!track || i < 0 || !Number.isFinite(time) || time > source.end) return empty(null);

      if (!SUPPORTED.has(track.schema)) return empty('Unsupported geometry');

      if (
        track.times.length > 4096 ||
        list.some((item) => item.schema === 'tf2_msgs/TFMessage' && item.times.length > 4096)
      )
        return empty('Geometry limit');

      const tf = list
        .filter((item) => item.schema === 'tf2_msgs/TFMessage')
        .map((item) => lastAtOrBefore(item.times, time))
        .join(':');
      const key = `${source.hash}:${topic}:${i}:${tf}`;
      const known = cache.get(key);

      if (known) return known;

      let prepared: SpatialSnapshot;

      try {
        prepared = spatialFrame(track, i, list, time);
      } catch {
        prepared = empty('Unsupported geometry');
      }

      if (cache.size >= 2) cache.delete(cache.keys().next().value!);

      cache.set(key, prepared);

      return prepared;
    },
  };
}
