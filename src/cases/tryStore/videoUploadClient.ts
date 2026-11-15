import { workerClient } from '../../utils/workerRpc';
import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import type { TryVideoUpload, VideoUploadBatch } from './videoUploadTypes';

export const videoTransfers = (videos: TryVideoUpload[]): ArrayBuffer[] =>
  [...new Set(videos.map((video) => video.bytes.buffer))].filter(
    (buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer,
  );

export async function saveTryVideos(videos: TryVideoUpload[]): Promise<void> {
  if (!videos.length) return;

  const client = workerClient<{ upload: (batch: VideoUploadBatch) => Promise<{ result: null }> }>(
    () => new Worker(new URL('./videoUpload.worker.ts', import.meta.url), { type: 'module' }),
    async () => {
      throw new Error('Reload Basecase to save the camera video.');
    },
  );

  try {
    await client.call('upload', { videos, web: IS_WEB_DEMO, baseUrl: location.href }, videoTransfers(videos));
  } finally {
    client.dispose();
  }
}

export const saveTryCameraVideo = (id: string, bytes: Uint8Array, camera = 'operator') =>
  saveTryVideos([{ id, bytes, camera }]);
