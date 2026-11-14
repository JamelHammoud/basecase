import { joinVideos, type JoinedVideo } from './joinVideos';
import { CODEBASE_VERSION, lerobotFiles } from './lerobot';
import type { DatasetSpec } from './lerobotRows';
import { FILE_LIMITS, lerobotV3Files, MEGABYTE, type FileLimits } from './lerobotV3';

export const LEGACY_FOLDER = CODEBASE_VERSION;

export async function joinCameraVideos(
  spec: DatasetSpec,
  limits: FileLimits = FILE_LIMITS,
): Promise<Record<string, JoinedVideo>> {
  const joined: Record<string, JoinedVideo> = {};

  for (const { key } of spec.videos) {
    joined[key] = await joinVideos(
      spec.episodes.map((e) => e.videos[key]),
      limits.videoMb * MEGABYTE,
    );
  }

  return joined;
}

export async function datasetFiles(
  spec: DatasetSpec,
  limits: FileLimits = FILE_LIMITS,
): Promise<Record<string, Uint8Array>> {
  const v3 = lerobotV3Files(spec, await joinCameraVideos(spec, limits), limits);
  const legacy = Object.entries(lerobotFiles(spec)).map(([path, bytes]) => [`${LEGACY_FOLDER}/${path}`, bytes]);

  return { ...v3, ...Object.fromEntries(legacy) };
}
