import { DATASET_FPS } from './episodes';
import { SUBTASK_ANNOTATION } from './language';
import {
  basecaseFile,
  episodeStats,
  features,
  framesParquet,
  json,
  jsonl,
  placedEpisodes,
  scanWidthOf,
  SCAN_KEY,
  taskListOf,
  TASK_ANNOTATION,
  videoKey,
  widthsOf,
  type DatasetSpec,
} from './lerobotRows';

export const CODEBASE_VERSION = 'v2.1';

const CHUNK_SIZE = 1000;

const pad = (n: number, width: number) => String(n).padStart(width, '0');
const chunkOf = (episode: number) => `chunk-${pad(Math.floor(episode / CHUNK_SIZE), 3)}`;

export const dataPath = (episode: number) => `data/${chunkOf(episode)}/episode_${pad(episode, 6)}.parquet`;
export const videoPath = (episode: number, key: string) =>
  `videos/${chunkOf(episode)}/${videoKey(key)}/episode_${pad(episode, 6)}.mp4`;

function info(spec: DatasetSpec) {
  const frames = spec.episodes.reduce((n, e) => n + e.frames.length, 0);

  return {
    codebase_version: CODEBASE_VERSION,
    robot_type: spec.robotType,
    total_episodes: spec.episodes.length,
    total_frames: frames,
    total_tasks: taskListOf(spec).length,
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
  const scan = scanWidthOf(spec);

  return {
    state: { ...joints, ...(scan ? { scan: { start: 0, end: scan, original_key: SCAN_KEY } } : {}) },
    action: joints,
    video: Object.fromEntries(spec.videos.map((v) => [v.key, { original_key: videoKey(v.key) }])),
    annotation: Object.fromEntries(
      [TASK_ANNOTATION, SUBTASK_ANNOTATION].map((k) => [k.replace(/^annotation\./, ''), {}]),
    ),
  };
}

export function lerobotFiles(spec: DatasetSpec): Record<string, Uint8Array> {
  const widths = widthsOf(spec);
  const files: Record<string, Uint8Array> = {};

  for (const placed of placedEpisodes(spec)) {
    const { episode } = placed.at;

    files[dataPath(episode)] = framesParquet([placed], widths);

    for (const [key, bytes] of Object.entries(spec.episodes[episode].videos)) files[videoPath(episode, key)] = bytes;
  }

  files['meta/info.json'] = json(info(spec));
  files['meta/episodes.jsonl'] = jsonl(
    spec.episodes.map((e, episode_index) => ({ episode_index, tasks: [e.task], length: e.frames.length })),
  );
  files['meta/episodes_stats.jsonl'] = jsonl(
    placedEpisodes(spec).map(({ at }) => ({
      episode_index: at.episode,
      stats: episodeStats(spec.episodes[at.episode], widths, at),
    })),
  );
  files['meta/tasks.jsonl'] = jsonl(taskListOf(spec).map((task, task_index) => ({ task_index, task })));
  files['meta/modality.json'] = json(modality(spec));
  files['meta/basecase.json'] = basecaseFile(spec);

  return files;
}
