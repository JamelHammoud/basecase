import { saveWebTryVideoAsset } from './webTryVideos';
import type { VideoUploadBatch } from './videoUploadTypes';

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((n) => n.toString(16).padStart(2, '0')).join('');
const hashOf = async (bytes: Uint8Array) =>
  hex(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

export async function uploadTryVideos(batch: VideoUploadBatch, send: typeof fetch = fetch): Promise<void> {
  const uploaded = new Set<string>();
  const hashes = new Map<Uint8Array, string>();

  for (const video of batch.videos) {
    const { id, camera, bytes } = video;

    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new Error('Choose a camera video under 2 GB.');

    const hash = hashes.get(bytes) ?? (await hashOf(bytes));

    hashes.set(bytes, hash);

    if (batch.web) {
      await saveWebTryVideoAsset({ id, camera, hash, bytes: uploaded.has(hash) ? undefined : bytes });
      uploaded.add(hash);

      continue;
    }

    const url = new URL(`/api/tries/video/${encodeURIComponent(id)}/${encodeURIComponent(camera)}`, batch.baseUrl);

    url.searchParams.set('asset', hash);

    const init: RequestInit = uploaded.has(hash)
      ? { method: 'POST' }
      : {
          method: 'PUT',
          body: bytes as Uint8Array<ArrayBuffer>,
          headers: { 'X-Video-Bytes': String(bytes.byteLength) },
        };
    const response = await send(url.toString(), init);

    if (!response.ok) throw new Error('Import the camera video again.');

    uploaded.add(hash);
  }
}
