import { plural } from '../../../electron/plural.mjs';
import type { LeRobotInfo, VideoFeature } from './lerobotMeta';
import {
  fillTemplate,
  mismatched,
  readJsonLines,
  readParquet,
  refuse,
  shortText,
  toNumber,
  unreadable,
  wholeNumber,
  type DatasetFiles,
  type Row,
} from './lerobotSource';
import { IMPORT_LIMITS, type SourceVideo } from './types';

export interface EpisodePlan {
  index: number;
  task: string | null;
  length: number;
  dataPath: string;
  videos: SourceVideo[];
}

const EPISODES_JSONL = 'meta/episodes.jsonl';
const EPISODES_FOLDER = 'meta/episodes';
const EPISODE_FILE = /^meta\/episodes\/chunk-\d+\/file-\d+\.parquet$/;

const firstTask = (tasks: unknown) => (Array.isArray(tasks) ? shortText(tasks[0]) : null);

const checkCount = (count: number) => {
  if (count > IMPORT_LIMITS.episodes) {
    refuse(`The dataset has more than ${plural(IMPORT_LIMITS.episodes, 'episode')}.`);
  }
};

interface PlanContext {
  info: LeRobotInfo;
  path: string;
}

function v2Plan(row: Row, { info, path }: PlanContext): EpisodePlan {
  const index = wholeNumber(row.episode_index, path);
  const length = wholeNumber(row.length, path);
  const values = { episode_chunk: Math.floor(index / info.chunksSize), episode_index: index };

  return {
    index,
    task: firstTask(row.tasks),
    length,
    dataPath: fillTemplate(info.dataPath, values),
    videos: info.videos.map((v) => ({
      camera: v.camera,
      path: fillTemplate(info.videoPath, { ...values, video_key: v.key }),
      from: 0,
      to: length / info.fps,
      frames: length,
    })),
  };
}

async function v2Plans(files: DatasetFiles, info: LeRobotInfo): Promise<EpisodePlan[]> {
  const rows = await readJsonLines(files, EPISODES_JSONL);

  checkCount(rows.length);

  return rows.map((row) => v2Plan(row, { info, path: EPISODES_JSONL }));
}

function v3Video(row: Row, feature: VideoFeature, { info, path }: PlanContext): SourceVideo {
  const at = `videos/${feature.key}`;
  const from = toNumber(row[`${at}/from_timestamp`]);
  const to = toNumber(row[`${at}/to_timestamp`]);
  const location = {
    video_key: feature.key,
    chunk_index: wholeNumber(row[`${at}/chunk_index`], path),
    file_index: wholeNumber(row[`${at}/file_index`], path),
  };

  if (!(Number.isFinite(from) && Number.isFinite(to) && from >= 0 && to >= from)) unreadable(path);

  return { camera: feature.camera, path: fillTemplate(info.videoPath, location), from, to };
}

function v3Plan(row: Row, context: PlanContext): EpisodePlan {
  const { info, path } = context;
  const length = wholeNumber(row.length, path);
  const span = wholeNumber(row.dataset_to_index, path) - wholeNumber(row.dataset_from_index, path);
  const location = {
    chunk_index: wholeNumber(row['data/chunk_index'], path),
    file_index: wholeNumber(row['data/file_index'], path),
  };

  if (span !== length) mismatched(path);

  return {
    index: wholeNumber(row.episode_index, path),
    task: firstTask(row.tasks),
    length,
    dataPath: fillTemplate(info.dataPath, location),
    videos: info.videos.map((v) => ({ ...v3Video(row, v, context), frames: length })),
  };
}

const v3Columns = (info: LeRobotInfo) => [
  'episode_index',
  'tasks',
  'length',
  'data/chunk_index',
  'data/file_index',
  'dataset_from_index',
  'dataset_to_index',
  ...info.videos.flatMap(({ key }) =>
    ['chunk_index', 'file_index', 'from_timestamp', 'to_timestamp'].map((field) => `videos/${key}/${field}`),
  ),
];

async function v3Plans(files: DatasetFiles, info: LeRobotInfo): Promise<EpisodePlan[]> {
  const paths = [...files.keys()].filter((p) => EPISODE_FILE.test(p)).sort();
  const plans: EpisodePlan[] = [];

  if (!paths.length) refuse(`The dataset’s ${EPISODES_FOLDER} is missing.`);

  for (const path of paths) {
    const { rows } = await readParquet(files, path, v3Columns(info));

    checkCount(plans.length + rows.length);
    plans.push(...rows.map((row) => v3Plan(row, { info, path })));
  }

  return plans;
}

function inOrder(plans: EpisodePlan[], path: string): EpisodePlan[] {
  const sorted = plans.toSorted((a, b) => a.index - b.index);

  if (!sorted.length) refuse('The dataset has no episodes.');

  if (sorted.some((p, i) => i > 0 && p.index === sorted[i - 1].index)) mismatched(path);

  return sorted;
}

export async function episodePlans(files: DatasetFiles, info: LeRobotInfo): Promise<EpisodePlan[]> {
  if (info.format === 'lerobot-v3.0') return inOrder(await v3Plans(files, info), EPISODES_FOLDER);

  return inOrder(await v2Plans(files, info), EPISODES_JSONL);
}
