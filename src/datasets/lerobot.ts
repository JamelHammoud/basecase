import { parquetWriteBuffer } from 'hyparquet-writer';
import { columnStats, DATASET_FPS, type EpisodeData, type FeatureStats, type JointGroup } from './episodes';

export const CODEBASE_VERSION = 'v2.1';
export const TASK_ANNOTATION = 'annotation.human.task_description';

const CHUNK_SIZE = 1000;

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

export interface DatasetSpec {
  robotType: string;
  jointNames: string[];
  jointGroups?: JointGroup[];
  videos: VideoFeature[];
  episodes: DatasetEpisode[];
  source: Record<string, unknown>;
}

type SchemaElement = Record<string, unknown>;

const pad = (n: number, width: number) => String(n).padStart(width, '0');
const chunkOf = (episode: number) => `chunk-${pad(Math.floor(episode / CHUNK_SIZE), 3)}`;

export const dataPath = (episode: number) => `data/${chunkOf(episode)}/episode_${pad(episode, 6)}.parquet`;
export const videoPath = (episode: number, key: string) =>
  `videos/${chunkOf(episode)}/observation.images.${key}/episode_${pad(episode, 6)}.mp4`;

const encoder = new TextEncoder();
const json = (value: unknown) => encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
const jsonl = (rows: unknown[]) => encoder.encode(rows.map((r) => `${JSON.stringify(r)}\n`).join(''));

const listColumn = (name: string): SchemaElement[] => [
  { name, repetition_type: 'REQUIRED', converted_type: 'LIST', num_children: 1 },
  { name: 'list', repetition_type: 'REPEATED', num_children: 1 },
  { name: 'element', type: 'FLOAT', repetition_type: 'REQUIRED' },
];

const scalar = (name: string, type: string): SchemaElement => ({ name, type, repetition_type: 'REQUIRED' });

const INT_COLUMNS = ['frame_index', 'episode_index', 'index', 'task_index', TASK_ANNOTATION];

const SCHEMA: SchemaElement[] = [
  { name: 'root', num_children: 10 },
  ...listColumn('observation.state'),
  ...listColumn('action'),
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

interface EpisodeIndex {
  episode: number;
  task: number;
  start: number;
}

function episodeParquet(e: EpisodeData, width: number, at: EpisodeIndex): Uint8Array {
  const length = e.frames.length;
  const ints = (f: (i: number) => number) => Array.from({ length }, (_, i) => BigInt(f(i)));
  const intData: Record<string, bigint[]> = {
    frame_index: ints((i) => i),
    episode_index: ints(() => at.episode),
    index: ints((i) => at.start + i),
    task_index: ints(() => at.task),
    [TASK_ANNOTATION]: ints(() => at.task),
  };
  const buffer = parquetWriteBuffer({
    schema: SCHEMA as never,
    columnData: [
      { name: 'observation.state', data: rowsOf(e.state, width) },
      { name: 'action', data: rowsOf(e.action, width) },
      { name: 'timestamp', data: e.timestamps },
      ...INT_COLUMNS.map((name) => ({ name, data: intData[name] })),
      { name: 'next.reward', data: Float32Array.from({ length }, (_, i) => (i === length - 1 ? 1 : 0)) },
      { name: 'next.done', data: Array.from({ length }, (_, i) => i === length - 1) },
    ],
  });

  return new Uint8Array(buffer);
}

const scalarFeature = (dtype: string) => ({ dtype, shape: [1], names: null });

function features(spec: DatasetSpec) {
  const joints = { shape: [spec.jointNames.length], names: spec.jointNames };
  const videos = Object.fromEntries(
    spec.videos.map((v) => [
      `observation.images.${v.key}`,
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

  return {
    'observation.state': { dtype: 'float32', ...joints },
    action: { dtype: 'float32', ...joints },
    ...videos,
    timestamp: scalarFeature('float32'),
    ...Object.fromEntries(INT_COLUMNS.map((name) => [name, scalarFeature('int64')])),
    'next.reward': scalarFeature('float32'),
    'next.done': scalarFeature('bool'),
  };
}

function info(spec: DatasetSpec) {
  const frames = spec.episodes.reduce((n, e) => n + e.frames.length, 0);
  const tasks = new Set(spec.episodes.map((e) => e.task)).size;

  return {
    codebase_version: CODEBASE_VERSION,
    robot_type: spec.robotType,
    total_episodes: spec.episodes.length,
    total_frames: frames,
    total_tasks: tasks,
    total_videos: spec.episodes.length * spec.videos.length,
    total_chunks: Math.max(1, Math.ceil(spec.episodes.length / CHUNK_SIZE)),
    chunks_size: CHUNK_SIZE,
    fps: DATASET_FPS,
    splits: { train: `0:${spec.episodes.length}` },
    data_path: 'data/chunk-{episode_chunk:03d}/episode_{episode_index:06d}.parquet',
    video_path: 'videos/chunk-{episode_chunk:03d}/{video_key}/episode_{episode_index:06d}.mp4',
    features: features(spec),
  };
}

function modality(spec: DatasetSpec) {
  const groups = spec.jointGroups ?? [{ name: 'joints', start: 0, end: spec.jointNames.length }];
  const joints = Object.fromEntries(groups.map((g) => [g.name, { start: g.start, end: g.end }]));

  return {
    state: joints,
    action: joints,
    video: Object.fromEntries(spec.videos.map((v) => [v.key, { original_key: `observation.images.${v.key}` }])),
    annotation: { [TASK_ANNOTATION.replace(/^annotation\./, '')]: {} },
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

function episodeStats(e: DatasetEpisode, width: number, at: EpisodeIndex) {
  const length = e.frames.length;
  const constant = (v: number) => columnStats(Array<number>(length).fill(v), 1);

  return {
    'observation.state': columnStats(e.state, width),
    action: columnStats(e.action, width),
    timestamp: columnStats(e.timestamps, 1),
    frame_index: columnStats(
      Array.from({ length }, (_, i) => i),
      1,
    ),
    episode_index: constant(at.episode),
    index: columnStats(
      Array.from({ length }, (_, i) => at.start + i),
      1,
    ),
    task_index: constant(at.task),
    ...Object.fromEntries(Object.entries(e.imageStats).map(([key, s]) => [`observation.images.${key}`, perChannel(s)])),
  };
}

export function lerobotFiles(spec: DatasetSpec): Record<string, Uint8Array> {
  const width = spec.jointNames.length;
  const taskList = [...new Set(spec.episodes.map((e) => e.task))];
  const files: Record<string, Uint8Array> = {};
  const episodesMeta: unknown[] = [];
  const statsMeta: unknown[] = [];
  let start = 0;

  spec.episodes.forEach((e, episode) => {
    const at = { episode, task: taskList.indexOf(e.task), start };

    files[dataPath(episode)] = episodeParquet(e, width, at);

    for (const [key, bytes] of Object.entries(e.videos)) files[videoPath(episode, key)] = bytes;

    episodesMeta.push({ episode_index: episode, tasks: [e.task], length: e.frames.length });
    statsMeta.push({ episode_index: episode, stats: episodeStats(e, width, at) });
    start += e.frames.length;
  });

  files['meta/info.json'] = json(info(spec));
  files['meta/episodes.jsonl'] = jsonl(episodesMeta);
  files['meta/episodes_stats.jsonl'] = jsonl(statsMeta);
  files['meta/tasks.jsonl'] = jsonl(taskList.map((task, task_index) => ({ task_index, task })));
  files['meta/modality.json'] = json(modality(spec));
  files['meta/basecase.json'] = json({
    ...spec.source,
    episodes: spec.episodes.map((e, i) => ({ episode_index: i, ...e.source })),
  });

  return files;
}
