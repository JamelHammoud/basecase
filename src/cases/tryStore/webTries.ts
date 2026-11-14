import type { Recording } from '../../sim/recorder';
import { indexedDbStore } from '../../utils/keyValueStore';
import { readStoredTry, summaryOf, type StoredTry } from '../tryFile';
import { TRIES_LABEL, type TryBackend } from './types';

const manifests = indexedDbStore<StoredTry>({
  database: 'basecase-try-manifests',
  store: 'manifests',
  label: TRIES_LABEL,
});
const recordings = indexedDbStore<Recording>({
  database: 'basecase-try-recordings',
  store: 'recordings',
  label: TRIES_LABEL,
});
const strips = indexedDbStore<Blob>({ database: 'basecase-try-strips', store: 'strips', label: TRIES_LABEL });

const indexes = indexedDbStore<Uint8Array>({ database: 'basecase-try-index', store: 'index', label: TRIES_LABEL });

const SEARCH_INDEX = 'search';

export const webTries: TryBackend = {
  list: async () => {
    const [stored, recorded, stripped] = await Promise.all([manifests.values(), recordings.keys(), strips.keys()]);
    const hasRecording = new Set(recorded);
    const hasStrip = new Set(stripped);

    return stored.flatMap((raw) => {
      const s = readStoredTry(raw);

      return s ? [summaryOf(s, { recording: hasRecording.has(s.id), strip: hasStrip.has(s.id) })] : [];
    });
  },
  save: async (stored, recording) => {
    if (recording) await recordings.put(stored.id, recording);

    await manifests.put(stored.id, stored);
  },
  recording: async (id) => (await recordings.get(id)) ?? null,
  strip: async (id) => (await strips.get(id)) ?? null,
  saveStrip: async (id, strip) => {
    if (await manifests.get(id)) await strips.put(id, strip);
  },
  delete: async (ids) => {
    await Promise.all(ids.flatMap((id) => [manifests.delete(id), recordings.delete(id), strips.delete(id)]));
  },
  manifests: async (ids) => {
    const found = await Promise.all(ids.map((id) => manifests.get(id)));

    return found.flatMap((raw) => readStoredTry(raw) ?? []);
  },
  index: async () => (await indexes.get(SEARCH_INDEX)) ?? null,
  saveIndex: async (bytes) => {
    await indexes.put(SEARCH_INDEX, bytes);
  },
};
