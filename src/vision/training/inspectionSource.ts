import type { StoredTry } from '../../cases/tryFile';
import { readSnapshotRecording } from '../../datasets/snapshotRecording';
import { datasetContentHash } from '../../datasets/contentHash';
import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import { readWebTryVideo } from '../../cases/tryStore/webTryVideos';
import { recordedVideoUrl } from '../../cameras/recordedProtocol';
import { readHubBytes } from '../../hub/skillDownloads.mjs';
import type { TrainingFrame } from '../frameSet';

export const INSPECTION_SOURCE_BYTES = 64 * 1024 * 1024;
export interface InspectionSourceIdentity {
  recording: string;
  videos: { camera: string; hash: string }[];
}

async function videoBytes(id: string, camera: string): Promise<Uint8Array> {
  if (IS_WEB_DEMO) return webVideoBytes(id, camera);

  const response = await fetch(recordedVideoUrl(id, camera), { cache: 'no-store' });

  if (!response.ok) throw new Error('Source try is unavailable');

  return readHubBytes(response, INSPECTION_SOURCE_BYTES, 'Source video');
}

async function webVideoBytes(id: string, camera: string) {
  const blob = await readWebTryVideo(id, camera);

  if (!blob || blob.size > INSPECTION_SOURCE_BYTES) throw new Error('Source try is unavailable');

  return new Uint8Array(await blob.arrayBuffer());
}

export async function inspectionSourceIdentity(
  bytes: Uint8Array,
  stored: StoredTry,
  readVideo = videoBytes,
): Promise<InspectionSourceIdentity> {
  if (!bytes.length || bytes.length > INSPECTION_SOURCE_BYTES || (stored.videos?.length ?? 0) > 4)
    throw new Error('Source try is unavailable');

  const recording = await datasetContentHash(bytes);
  const videos: InspectionSourceIdentity['videos'] = [];

  for (const video of stored.videos ?? []) {
    const content = await readVideo(stored.id, video.camera);

    if (!content.length || content.length > INSPECTION_SOURCE_BYTES) throw new Error('Source try is unavailable');

    videos.push({ camera: video.camera, hash: await datasetContentHash(content) });
  }

  return { recording, videos };
}

export async function restoreInspectionSource(
  input: {
    bytes: Uint8Array;
    stored: StoredTry;
    expected: InspectionSourceIdentity;
    origin: NonNullable<TrainingFrame['origin']>;
  },
  readVideo = videoBytes,
) {
  const { bytes, stored, expected, origin } = input;
  const actual = await inspectionSourceIdentity(bytes, stored, readVideo);

  if (JSON.stringify(actual) !== JSON.stringify(expected) || origin.tryId !== stored.id)
    throw new Error('Source try is unavailable');

  const recording = readSnapshotRecording(bytes);
  const seconds = recording.t[origin.frame];

  if (!Number.isFinite(seconds) || Math.abs(seconds - origin.seconds) > 1e-5)
    throw new Error('Source try is unavailable');

  return recording;
}
