import type { Recording } from '../../sim/recorder';
import { indexedDbStore } from '../../utils/keyValueStore';
import { encodeRecording } from '../recordingFile';
import { readStoredTry, summaryOf } from '../tryFile';
import { TRIES_LABEL, type TryBackend } from './types';
import { saveTryCameraVideo, saveTryVideos } from './videoUploadClient';
import { deleteWebTryVideos, webTryManifests as manifests, withWebVideoLock } from './webTryVideos';

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
  save: (stored, recording) =>
    withWebVideoLock(async () => {
      if (recording) await recordings.put(stored.id, recording);

      await manifests.put(stored.id, stored);
    }),
  update: (stored) =>
    withWebVideoLock(async () => {
      if (!(await manifests.get(stored.id))) return false;

      await manifests.put(stored.id, stored);

      return true;
    }),
  recording: async (id) => (await recordings.get(id)) ?? null,
  recordingBytes: async (id) => {
    const recording = await recordings.get(id);

    return recording ? encodeRecording(recording) : null;
  },
  strip: async (id) => (await strips.get(id)) ?? null,
  saveStrip: async (id, strip) => {
    if (await manifests.get(id)) await strips.put(id, strip);
  },
  delete: (ids) =>
    withWebVideoLock(async () => {
      await Promise.all(
        ids.flatMap((id) => [manifests.delete(id), recordings.delete(id), strips.delete(id), deleteWebTryVideos(id)]),
      );
    }),
  manifests: async (ids) => {
    const found = await Promise.all(ids.map((id) => manifests.get(id)));

    return found.flatMap((raw) => readStoredTry(raw) ?? []);
  },
  index: async () => (await indexes.get(SEARCH_INDEX)) ?? null,
  saveIndex: async (bytes) => {
    await indexes.put(SEARCH_INDEX, bytes);
  },
  session: async () => null,
  saveSession: (stored) =>
    withWebVideoLock(async () => {
      await manifests.put(stored.id, stored);
    }),
  saveVideo: saveTryCameraVideo,
  saveVideos: saveTryVideos,
};
