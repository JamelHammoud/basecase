import { indexedDbStore } from '../../utils/keyValueStore';
import { readStoredTry, type StoredTry } from '../tryFile';
import { TRIES_LABEL } from './types';

export const webTryManifests = indexedDbStore<StoredTry>({
  database: 'basecase-try-manifests',
  store: 'manifests',
  label: TRIES_LABEL,
});

const videos = indexedDbStore<Blob | string>({ database: 'basecase-try-videos', store: 'videos', label: TRIES_LABEL });
const assets = indexedDbStore<Blob>({ database: 'basecase-try-video-assets', store: 'assets', label: TRIES_LABEL });
const MAX_VIDEO = 2 * 1024 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const videoKey = (id: string, camera: string) => `${id}\0${JSON.stringify(camera)}`;

async function matchingCamera(id: string, camera: string) {
  const manifest = readStoredTry(await webTryManifests.get(id));

  return manifest?.id === id && manifest.videos?.filter((video) => video.camera === camera).length === 1;
}

const locked = <T>(work: () => Promise<T>): Promise<T> => navigator.locks.request('basecase-try-videos', work);

interface WebVideoAsset {
  id: string;
  camera: string;
  hash: string;
  bytes?: Uint8Array;
}

export function saveWebTryVideoAsset({ id, camera, hash, bytes }: WebVideoAsset): Promise<void> {
  return locked(async () => {
    if (!HASH.test(hash) || !(await matchingCamera(id, camera))) throw new Error('Import the camera video again.');

    if (bytes && (!bytes.byteLength || bytes.byteLength > MAX_VIDEO))
      throw new Error('Choose a camera video under 2 GB.');

    const existing = await assets.get(hash);

    if (!existing && !bytes) throw new Error('Import the camera video again.');

    if (!existing && bytes) await assets.put(hash, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'video/mp4' }));

    await videos.put(videoKey(id, camera), hash);
  });
}

export async function readWebTryVideo(id: string, camera: string): Promise<Blob | null> {
  if (!(await matchingCamera(id, camera))) return null;

  const entry = await videos.get(videoKey(id, camera));
  const blob = typeof entry === 'string' && HASH.test(entry) ? await assets.get(entry) : entry;

  return blob instanceof Blob && blob.size > 0 && blob.size <= MAX_VIDEO ? blob : null;
}

export function deleteWebTryVideos(id: string): Promise<void> {
  return locked(async () => {
    await videos.deletePrefix(`${id}\0`);

    const references = new Set((await videos.values()).filter((entry) => typeof entry === 'string'));

    for (const hash of await assets.keys()) if (!references.has(hash)) await assets.delete(hash);
  });
}
