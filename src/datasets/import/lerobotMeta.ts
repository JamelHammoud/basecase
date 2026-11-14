import {
  isRecord,
  readJson,
  refuse,
  shortText,
  unreadable,
  wholeNumber,
  type DatasetFiles,
  type Row,
} from './lerobotSource';
import { IMPORT_LIMITS, type SourceFormat } from './types';

export const INFO_PATH = 'meta/info.json';
export const STATE_KEY = 'observation.state';
export const ACTION_KEY = 'action';

const CAMERA_PREFIX = 'observation.images.';
const DEFAULT_CHUNK_SIZE = 1000;

const FORMATS: Record<string, SourceFormat> = {
  'v2.0': 'lerobot-v2.1',
  'v2.1': 'lerobot-v2.1',
  'v3.0': 'lerobot-v3.0',
};

export interface VideoFeature {
  key: string;
  camera: string;
}

export interface LeRobotInfo {
  format: SourceFormat;
  fps: number;
  robotType: string | null;
  names: string[];
  withAction: boolean;
  dataPath: string;
  videoPath: string;
  chunksSize: number;
  videos: VideoFeature[];
}

const flatNames = (names: unknown): unknown[] => {
  if (Array.isArray(names)) return names.flatMap(flatNames);

  return isRecord(names) ? Object.values(names).flatMap(flatNames) : [names];
};

const widthOf = (shape: unknown): number | null =>
  Array.isArray(shape) && shape.length === 1 ? wholeNumber(shape[0], INFO_PATH) : null;

function namesOf(feature: unknown): string[] | null {
  if (!isRecord(feature)) return null;

  const names = feature.names === null || feature.names === undefined ? [] : flatNames(feature.names);
  const width = widthOf(feature.shape);

  if (!names.every((n) => typeof n === 'string')) return unreadable(INFO_PATH);

  if (width !== null && names.length && names.length !== width) return unreadable(INFO_PATH);

  return names.length ? (names as string[]) : Array.from({ length: width ?? 0 }, (_, i) => `state_${i}`);
}

function stateNames(features: Row): string[] {
  const names = namesOf(features[STATE_KEY]) ?? [];

  if (!names.length) refuse('The dataset has no observation.state.');

  if (names.length > IMPORT_LIMITS.joints) refuse(`The dataset’s robot has more than ${IMPORT_LIMITS.joints} joints.`);

  return names.map((n) => n.slice(0, IMPORT_LIMITS.textChars));
}

const videoFeatures = (features: Row): VideoFeature[] =>
  Object.entries(features)
    .filter(([, f]) => isRecord(f) && f.dtype === 'video')
    .map(([key]) => ({ key, camera: key.startsWith(CAMERA_PREFIX) ? key.slice(CAMERA_PREFIX.length) : key }));

const textOr = (value: unknown, fallback: string) => {
  if (value === undefined || value === null) return fallback;

  return typeof value === 'string' ? value : unreadable(INFO_PATH);
};

function versionOf(info: Row): SourceFormat {
  const version = typeof info.codebase_version === 'string' ? info.codebase_version : '';

  return FORMATS[version] ?? refuse('Basecase reads LeRobot v2.0, v2.1 and v3.0 datasets only.');
}

const fpsOf = (info: Row) =>
  typeof info.fps === 'number' && info.fps > 0 && Number.isFinite(info.fps) ? info.fps : unreadable(INFO_PATH);

const chunksSizeOf = (info: Row) =>
  info.chunks_size === undefined
    ? DEFAULT_CHUNK_SIZE
    : wholeNumber(info.chunks_size, INFO_PATH) || unreadable(INFO_PATH);

function templatesOf(info: Row, videos: VideoFeature[]) {
  const dataPath = textOr(info.data_path, '');
  const videoPath = textOr(info.video_path, '');

  if (!dataPath || (videos.length && !videoPath)) unreadable(INFO_PATH);

  return { dataPath, videoPath };
}

export async function readInfo(files: DatasetFiles): Promise<LeRobotInfo> {
  const info = await readJson(files, INFO_PATH);
  const format = versionOf(info);
  const features = isRecord(info.features) ? info.features : unreadable(INFO_PATH);
  const names = stateNames(features);
  const videos = videoFeatures(features);

  return {
    format,
    fps: fpsOf(info),
    robotType: shortText(info.robot_type),
    names,
    withAction: namesOf(features[ACTION_KEY])?.length === names.length,
    ...templatesOf(info, videos),
    chunksSize: chunksSizeOf(info),
    videos,
  };
}
