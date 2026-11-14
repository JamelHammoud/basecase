import { parquetWriteBuffer } from 'hyparquet-writer';
import { DATASET_FPS } from './episodes';
import type { JoinedVideo } from './joinVideos';
import { LANGUAGE_FEATURE, LANGUAGE_KEY } from './language';
import {
  basecaseFile,
  episodeStats,
  features,
  framesParquet,
  json,
  listOf,
  placedEpisodes,
  scalar,
  taskListOf,
  videoKey,
  widthsOf,
  type DatasetSpec,
  type EpisodeStats,
  type Placed,
  type SchemaElement,
  type Widths,
} from './lerobotRows';
import { aggregateStats } from './lerobotStats';

export const V3_VERSION = 'v3.0';

export interface FileLimits {
  dataMb: number;
  videoMb: number;
}

export const FILE_LIMITS: FileLimits = { dataMb: 100, videoMb: 200 };
export const MEGABYTE = 1024 * 1024;

const CHUNK_SIZE = 1000;
const FILE_PATTERN = 'chunk-{chunk_index:03d}/file-{file_index:03d}';

export const EPISODES_PATH = 'meta/episodes/chunk-000/file-000.parquet';
export const TASKS_PATH = 'meta/tasks.parquet';

const pad = (n: number) => String(n).padStart(3, '0');

const fileName = (n: number) => `chunk-${pad(Math.floor(n / CHUNK_SIZE))}/file-${pad(n % CHUNK_SIZE)}`;
const chunkIndex = (n: number) => Math.floor(n / CHUNK_SIZE);
const fileIndex = (n: number) => n % CHUNK_SIZE;

export const v3DataPath = (file: number) => `data/${fileName(file)}.parquet`;
export const v3VideoPath = (key: string, file: number) => `videos/${videoKey(key)}/${fileName(file)}.mp4`;

interface DataFile {
  bytes: Uint8Array;
  episodes: number[];
}

function dataFiles(placed: Placed[], widths: Widths, limitBytes: number): DataFile[] {
  const groups: Placed[][] = [];
  let size = 0;

  for (const p of placed) {
    const bytes = framesParquet([p], widths, true).byteLength;
    const current = groups.at(-1);

    if (!current || size + bytes >= limitBytes) {
      groups.push([p]);
      size = bytes;

      continue;
    }

    current.push(p);
    size += bytes;
  }

  return groups.map((g) => ({ bytes: framesParquet(g, widths, true), episodes: g.map((p) => p.at.episode) }));
}

const int64 = (name: string) => scalar(name, 'INT64');
const double = (name: string) => scalar(name, 'DOUBLE');
const ints = (values: number[]) => values.map((v) => BigInt(v));

const depthOf = (value: unknown): number => (Array.isArray(value) ? 1 + depthOf(value[0]) : 0);

const toBigInts = (value: unknown): unknown => (Array.isArray(value) ? value.map(toBigInts) : BigInt(value as number));

interface Column {
  schema: SchemaElement[];
  data: unknown[];
}

function statColumns(stats: EpisodeStats[]): [string, Column][] {
  return Object.entries(stats[0] ?? {}).flatMap(([feature, byStat]) =>
    Object.entries(byStat).map(([stat, sample]): [string, Column] => {
      const name = `stats/${feature}/${stat}`;
      const count = stat === 'count';
      const leaf = { type: count ? 'INT64' : 'DOUBLE', repetition_type: 'REQUIRED' };
      const values = stats.map((s) => s[feature][stat]);

      return [name, { schema: listOf(name, leaf, depthOf(sample)), data: count ? values.map(toBigInts) : values }];
    }),
  );
}

interface EpisodeRows {
  spec: DatasetSpec;
  placed: Placed[];
  data: DataFile[];
  videos: Record<string, JoinedVideo>;
  stats: EpisodeStats[];
}

function videoColumns({ spec, videos }: EpisodeRows): [string, Column][] {
  return spec.videos.flatMap(({ key }) => {
    const spans = videos[key]?.spans ?? [];
    const at = `videos/${videoKey(key)}`;

    return [
      [`${at}/chunk_index`, { schema: [int64(`${at}/chunk_index`)], data: ints(spans.map((s) => chunkIndex(s.file))) }],
      [`${at}/file_index`, { schema: [int64(`${at}/file_index`)], data: ints(spans.map((s) => fileIndex(s.file))) }],
      [`${at}/from_timestamp`, { schema: [double(`${at}/from_timestamp`)], data: spans.map((s) => s.from) }],
      [`${at}/to_timestamp`, { schema: [double(`${at}/to_timestamp`)], data: spans.map((s) => s.to) }],
    ] as [string, Column][];
  });
}

function episodesParquet(rows: EpisodeRows): Uint8Array {
  const { spec, placed, data } = rows;
  const fileOf = new Map(data.flatMap((f, n) => f.episodes.map((e) => [e, n] as const)));
  const files = placed.map((p) => fileOf.get(p.at.episode) ?? 0);
  const intColumn = (name: string, values: number[]): [string, Column] => [
    name,
    { schema: [int64(name)], data: ints(values) },
  ];
  const zeros = placed.map(() => 0);
  const columns: [string, Column][] = [
    intColumn(
      'episode_index',
      placed.map((p) => p.at.episode),
    ),
    intColumn('data/chunk_index', files.map(chunkIndex)),
    intColumn('data/file_index', files.map(fileIndex)),
    intColumn(
      'dataset_from_index',
      placed.map((p) => p.at.start),
    ),
    intColumn(
      'dataset_to_index',
      placed.map((p) => p.at.start + p.data.frames.length),
    ),
    ...videoColumns(rows),
    [
      'tasks',
      {
        schema: listOf('tasks', { type: 'BYTE_ARRAY', converted_type: 'UTF8', repetition_type: 'REQUIRED' }),
        data: spec.episodes.map((e) => [e.task]),
      },
    ],
    intColumn(
      'length',
      placed.map((p) => p.data.frames.length),
    ),
    ...statColumns(rows.stats),
    intColumn('meta/episodes/chunk_index', zeros),
    intColumn('meta/episodes/file_index', zeros),
  ];
  const schema = columns.flatMap(([, c]) => c.schema);

  return new Uint8Array(
    parquetWriteBuffer({
      schema: [{ name: 'root', num_children: columns.length }, ...schema] as never,
      columnData: columns.map(([name, c]) => ({ name, data: c.data })) as never,
    }),
  );
}

const PANDAS_TASKS = {
  index_columns: ['task'],
  column_indexes: [
    { name: null, field_name: null, pandas_type: 'unicode', numpy_type: 'object', metadata: { encoding: 'UTF-8' } },
  ],
  columns: [
    { name: 'task_index', field_name: 'task_index', pandas_type: 'int64', numpy_type: 'int64', metadata: null },
    { name: 'task', field_name: 'task', pandas_type: 'unicode', numpy_type: 'object', metadata: null },
  ],
  attributes: {},
};

function tasksParquet(tasks: string[]): Uint8Array {
  return new Uint8Array(
    parquetWriteBuffer({
      schema: [
        { name: 'root', num_children: 2 },
        int64('task_index'),
        { name: 'task', type: 'BYTE_ARRAY', converted_type: 'UTF8', repetition_type: 'REQUIRED' },
      ] as never,
      columnData: [
        { name: 'task_index', data: ints(tasks.map((_, i) => i)) },
        { name: 'task', data: tasks },
      ],
      kvMetadata: [{ key: 'pandas', value: JSON.stringify(PANDAS_TASKS) }],
    }),
  );
}

function info(spec: DatasetSpec, limits: FileLimits) {
  const frames = spec.episodes.reduce((n, e) => n + e.frames.length, 0);
  const withFps = Object.fromEntries(
    Object.entries(features(spec)).map(([key, f]) => [key, f.dtype === 'video' ? f : { ...f, fps: DATASET_FPS }]),
  );

  return {
    codebase_version: V3_VERSION,
    robot_type: spec.robotType,
    total_episodes: spec.episodes.length,
    total_frames: frames,
    total_tasks: taskListOf(spec).length,
    chunks_size: CHUNK_SIZE,
    data_files_size_in_mb: limits.dataMb,
    video_files_size_in_mb: limits.videoMb,
    fps: DATASET_FPS,
    splits: { train: `0:${spec.episodes.length}` },
    data_path: `data/${FILE_PATTERN}.parquet`,
    video_path: `videos/{video_key}/${FILE_PATTERN}.mp4`,
    features: { ...withFps, [LANGUAGE_KEY]: LANGUAGE_FEATURE },
  };
}

export function lerobotV3Files(
  spec: DatasetSpec,
  videos: Record<string, JoinedVideo>,
  limits: FileLimits = FILE_LIMITS,
): Record<string, Uint8Array> {
  const widths = widthsOf(spec);
  const placed = placedEpisodes(spec);
  const data = dataFiles(placed, widths, limits.dataMb * MEGABYTE);
  const stats = placed.map((p) => episodeStats(spec.episodes[p.at.episode], widths, p.at));
  const files: Record<string, Uint8Array> = {};

  data.forEach((f, n) => (files[v3DataPath(n)] = f.bytes));

  for (const { key } of spec.videos) videos[key]?.files.forEach((bytes, n) => (files[v3VideoPath(key, n)] = bytes));

  files['meta/info.json'] = json(info(spec, limits));
  files['meta/stats.json'] = json(stats.length ? aggregateStats(stats) : {});
  files[TASKS_PATH] = tasksParquet(taskListOf(spec));
  files[EPISODES_PATH] = episodesParquet({ spec, placed, data, videos, stats });
  files['meta/basecase.json'] = basecaseFile(spec);

  return files;
}
