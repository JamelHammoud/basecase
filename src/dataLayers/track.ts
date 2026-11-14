import type { DataMessage, DataSchema } from './messages';

export type DataKind = 'points' | 'scan' | 'frames' | 'path' | 'markers' | 'grid' | 'poses';

export const KIND_OF: Record<DataSchema, DataKind> = {
  'sensor_msgs/LaserScan': 'scan',
  'sensor_msgs/PointCloud2': 'points',
  'scene/Points': 'scan',
  'visualization_msgs/Marker': 'markers',
  'visualization_msgs/MarkerArray': 'markers',
  'foxglove.SceneUpdate': 'markers',
  'nav_msgs/OccupancyGrid': 'grid',
  'nav_msgs/Path': 'path',
  'nav_msgs/Odometry': 'path',
  'geometry_msgs/PoseStamped': 'poses',
  'tf2_msgs/TFMessage': 'frames',
};

const ACCUMULATES = new Set<DataSchema>([
  'nav_msgs/Odometry',
  'visualization_msgs/Marker',
  'visualization_msgs/MarkerArray',
]);

export const DECAY_S: Partial<Record<DataKind, number>> = { scan: 0, points: 0 };

type MessageMap = { [M in DataMessage as M['schema']]: M['message'] };

export type MessageOf<S extends DataSchema> = MessageMap[S];

export interface DataTrack<S extends DataSchema = DataSchema> {
  id: string;
  name: string;
  schema: S;
  owner?: string;
  fixed?: boolean;
  decayS?: number;
  version: number;
  times: ArrayLike<number>;
  message: (i: number) => MessageOf<S>;
}

export interface TimedMessage<S extends DataSchema> {
  at: number;
  message: MessageOf<S>;
}

export interface TrackInfo {
  id: string;
  name: string;
  schema: DataSchema;
  owner?: string;
  fixed?: boolean;
  decayS?: number;
}

export function listTrack<S extends DataSchema>(
  info: TrackInfo & { schema: S },
  entries: Array<TimedMessage<S>>,
  version = 0,
): DataTrack<S> {
  const sorted = [...entries].sort((a, b) => a.at - b.at);

  return {
    ...info,
    version,
    times: sorted.map((e) => e.at),
    message: (i) => sorted[i].message,
  };
}

export function lastAtOrBefore(times: ArrayLike<number>, at: number): number {
  let lo = 0;
  let hi = times.length - 1;

  if (hi < 0 || times[0] > at) return -1;

  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;

    if (times[mid] <= at) lo = mid;
    else hi = mid - 1;
  }

  return lo;
}

export interface MessageSpan {
  from: number;
  to: number;
}

export function spanAt(track: Pick<DataTrack, 'times' | 'decayS' | 'schema'>, at: number | null): MessageSpan | null {
  const { times } = track;
  const to = at === null ? times.length - 1 : lastAtOrBefore(times, at);

  if (to < 0) return null;

  if (ACCUMULATES.has(track.schema)) return { from: 0, to };

  const decay = track.decayS ?? DECAY_S[KIND_OF[track.schema]] ?? 0;

  if (decay <= 0) return { from: to, to };

  return { from: lastAtOrBefore(times, times[to] - decay) + 1, to };
}

export const kindOf = (track: Pick<DataTrack, 'schema'>) => KIND_OF[track.schema];

export const asTrack = <S extends DataSchema>(track: DataTrack): DataTrack<S> => track as unknown as DataTrack<S>;
