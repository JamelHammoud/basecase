import { indexedDbStore } from '../../utils/keyValueStore';

const videos = indexedDbStore<Blob | string>({ database: 'basecase-try-videos', store: 'videos' });

const videoKey = (id: string, path: string) => `try/${id}/${path}`;

export async function loadVideoBlob(id: string, path: string): Promise<Blob | null> {
  const value = await videos.get(videoKey(id, path));
  const blob = typeof value === 'string' ? await videos.get(value) : value;

  return blob instanceof Blob ? blob : null;
}

export async function keepSharedVideoBlob(key: string, blob: Blob, tries: { id: string; path: string }[]) {
  const shared = `shared/${key}`;

  await videos.put(shared, blob);
  await Promise.all(tries.map(({ id, path }) => videos.put(videoKey(id, path), shared)));
}

export async function deleteVideoBlobs(ids: readonly string[]) {
  const deleting = new Set(ids);
  const keys = await videos.keys();
  const refs = keys.filter((key) => key.startsWith('try/'));
  const entries = await Promise.all(refs.map(async (key) => ({ key, value: await videos.get(key) })));
  const removed = entries.filter(({ key }) => deleting.has(key.split('/')[1]));
  const retained = new Set(entries.filter(({ key }) => !deleting.has(key.split('/')[1])).map(({ value }) => value));
  const shared = removed.flatMap(({ value }) => (typeof value === 'string' && !retained.has(value) ? [value] : []));

  await Promise.all(ids.map((id) => videos.deletePrefix(`try/${id}/`)));
  await Promise.all([...new Set(shared)].map((key) => videos.delete(key)));
}
