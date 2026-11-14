import { parquetWriteBuffer } from 'hyparquet-writer';
import { columnStats, DATASET_FPS, type EpisodeData, type FeatureStats, type JointGroup } from './episodes';

export const TASK_ANNOTATION = 'annotation.human.task_description';
export const SCAN_KEY = 'observation.scan';

export interface VideoFeature {
  key: string;
  width: number;
  height: number;
  codec: string;
}

export interface DatasetEpisode extends EpisodeData {
  videos: Record<string, Uint8Array>;
  imageStats: Record<string, FeatureStats>;
  source: Record<string, unknown>;
}

export interface ScanSensor {
  part: string;
  name: string;
  rays: number;
  rangeM: number;
  rateHz: number;
  fovDeg: number;
}

export interface DatasetSpec {
  robotType: string;
  jointNames: string[];
  jointGroups?: JointGroup[];
  videos: VideoFeature[];
  episodes: DatasetEpisode[];
  source: Record<string, unknown>;
  scans?: ScanSensor[];
}

export interface Widths {
  joints: number;
  scan: number;
}

export interface EpisodeAt {
  episode: number;
  task: number;
  start: number;
}

export interface Placed {
  data: EpisodeData;
  at: EpisodeAt;
}

export type SchemaElement = Record<string, unknown>;

export const scanWidthOf = (spec: Pick<DatasetSpec, 'scans'>) => (spec.scans ?? []).reduce((n, s) => n + s.rays, 0);

export const widthsOf = (spec: DatasetSpec): Widths => ({ joints: spec.jointNames.length, scan: scanWidthOf(spec) });

export const taskListOf = (spec: DatasetSpec) => [...new Set(spec.episodes.map((e) => e.task))];

export const videoKey = (key: string) => `observation.images.${key}`;

export function placedEpisodes(spec: DatasetSpec): Placed[] {
  const tasks = taskListOf(spec);
  let start = 0;

  return spec.episodes.map((data, episode) => {
    const at = { episode, task: tasks.indexOf(data.task), start };

    start += data.frames.length;

    return { data, at };
  });
}

const encoder = new TextEncoder();

export const json = (value: unknown) => encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
export const jsonl = (rows: unknown[]) => encoder.encode(rows.map((r) => `${JSON.stringify(r)}\n`).join(''));

export const listOf = (name: string, leaf: SchemaElement, depth = 1): SchemaElement[] =>
  depth === 0
    ? [{ ...leaf, name }]
    : [
        { name, repetition_type: 'REQUIRED', converted_type: 'LIST', num_children: 1 },
        { name: 'list', repetition_type: 'REPEATED', num_children: 1 },
        ...listOf('element', leaf, depth - 1),
      ];

export const scalar = (name: string, type: string): SchemaElement => ({ name, type, repetition_type: 'REQUIRED' });

const floatList = (name: string) => listOf(name, { type: 'FLOAT', repetition_type: 'REQUIRED' });

const INT_COLUMNS = ['frame_index', 'episode_index', 'index', 'task_index', TASK_ANNOTATION];

const schemaOf = (scan: boolean): SchemaElement[] => [
  { name: 'root', num_children: scan ? 11 : 10 },
  ...floatList('observation.state'),
  ...(scan ? floatList(SCAN_KEY) : []),
  ...floatList('action'),
  scalar('timestamp', 'FLOAT'),
  ...INT_COLUMNS.map((name) => scalar(name, 'INT64')),
  scalar('next.reward', 'FLOAT'),
  scalar('next.done', 'BOOLEAN'),
];

function rowsOf(values: Float32Array, width: number): number[][] {
  return Array.from({ length: values.length / width }, (_, r) =>
    Array.from(values.subarray(r * width, (r + 1) * width)),
  );
}

const perFrame = <T>(placed: Placed[], value: (p: Placed, i: number, length: number) => T): T[] =>
  placed.flatMap((p) => Array.from({ length: p.data.frames.length }, (_, i) => value(p, i, p.data.frames.length)));

function intColumns(placed: Placed[]): Record<string, bigint[]> {
  const ints = (f: (p: Placed, i: number) => number) => perFrame(placed, (p, i) => BigInt(f(p, i)));
  const task = ints((p) => p.at.task);

  return {
    frame_index: ints((_, i) => i),
    episode_index: ints((p) => p.at.episode),
    index: ints((p, i) => p.at.start + i),
    task_index: task,
    [TASK_ANNOTATION]: task,
  };
}

export function framesParquet(placed: Placed[], widths: Widths): Uint8Array {
  const intData = intColumns(placed);
  const withScan = widths.scan > 0 && placed.every((p) => p.data.scan);
  const scan = withScan ? [{ name: SCAN_KEY, data: placed.flatMap((p) => rowsOf(p.data.scan!, widths.scan)) }] : [];
  const buffer = parquetWriteBuffer({
    schema: schemaOf(withScan) as never,
    columnData: [
      { name: 'observation.state', data: placed.flatMap((p) => rowsOf(p.data.state, widths.joints)) },
      ...scan,
      { name: 'action', data: placed.flatMap((p) => rowsOf(p.data.action, widths.joints)) },
      { name: 'timestamp', data: Float32Array.from(placed.flatMap((p) => Array.from(p.data.timestamps))) },
      ...INT_COLUMNS.map((name) => ({ name, data: intData[name] })),
      { name: 'next.reward', data: Float32Array.from(perFrame(placed, (_, i, n) => (i === n - 1 ? 1 : 0))) },
      { name: 'next.done', data: perFrame(placed, (_, i, n) => i === n - 1) },
    ],
  });

  return new Uint8Array(buffer);
}

const scalarFeature = (dtype: string) => ({ dtype, shape: [1], names: null });

function videoFeatures(spec: DatasetSpec) {
  return Object.fromEntries(
    spec.videos.map((v) => [
      videoKey(v.key),
      {
        dtype: 'video',
        shape: [v.height, v.width, 3],
        names: ['height', 'width', 'channels'],
        info: {
          'video.height': v.height,
          'video.width': v.width,
          'video.codec': v.codec,
          'video.pix_fmt': 'yuv420p',
          'video.is_depth_map': false,
          'video.fps': DATASET_FPS,
          'video.channels': 3,
          has_audio: false,
        },
      },
    ]),
  );
}

export function features(spec: DatasetSpec) {
  const joints = { shape: [spec.jointNames.length], names: spec.jointNames };
  const scan = scanWidthOf(spec);

  return {
    'observation.state': { dtype: 'float32', ...joints },
    ...(scan ? { [SCAN_KEY]: { dtype: 'float32', shape: [scan], names: null } } : {}),
    action: { dtype: 'float32', ...joints },
    ...videoFeatures(spec),
    timestamp: scalarFeature('float32'),
    ...Object.fromEntries(INT_COLUMNS.map((name) => [name, scalarFeature('int64')])),
    'next.reward': scalarFeature('float32'),
    'next.done': scalarFeature('bool'),
  };
}

const nest = (values: number[]) => values.map((v) => [[v]]);

const perChannel = (s: FeatureStats) => ({
  min: nest(s.min),
  max: nest(s.max),
  mean: nest(s.mean),
  std: nest(s.std),
  count: s.count,
});

export type EpisodeStats = Record<string, Record<string, unknown[]>>;

const indexRange = (length: number, from: number) => Array.from({ length }, (_, i) => from + i);

export function episodeStats(e: DatasetEpisode, widths: Widths, at: EpisodeAt): EpisodeStats {
  const length = e.frames.length;
  const constant = (v: number) => columnStats(Array<number>(length).fill(v), 1);

  return {
    'observation.state': columnStats(e.state, widths.joints),
    ...(widths.scan && e.scan ? { [SCAN_KEY]: columnStats(e.scan, widths.scan) } : {}),
    action: columnStats(e.action, widths.joints),
    timestamp: columnStats(e.timestamps, 1),
    frame_index: columnStats(indexRange(length, 0), 1),
    episode_index: constant(at.episode),
    index: columnStats(indexRange(length, at.start), 1),
    task_index: constant(at.task),
    ...Object.fromEntries(Object.entries(e.imageStats).map(([key, s]) => [videoKey(key), perChannel(s)])),
  } as unknown as EpisodeStats;
}

export const basecaseFile = (spec: DatasetSpec) =>
  json({
    ...spec.source,
    ...(spec.scans?.length ? { scans: spec.scans } : {}),
    episodes: spec.episodes.map((e, i) => ({ episode_index: i, ...e.source })),
  });
