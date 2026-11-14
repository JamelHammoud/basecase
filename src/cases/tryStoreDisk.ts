import { base64ToBytes, bytesToBase64 } from '../utils/base64';
import { channelCall } from '../utils/platform/channelCall';
import { electron } from '../utils/platform/transport';
import type { TryRecord } from './tries';
import { packRecording, unpackRecording } from './tryRecording';
import type { TryBackend } from './tryStore';

type Bytes = Uint8Array | string | null | undefined;

const bytesOf = (value: Bytes) => (typeof value === 'string' ? base64ToBytes(value) : (value ?? null));

const forHttp = (payload: unknown) =>
  payload && typeof payload === 'object' && !Array.isArray(payload)
    ? Object.fromEntries(
        Object.entries(payload).map(([k, v]) => [k, v instanceof Uint8Array ? bytesToBase64(v) : (v as unknown)]),
      )
    : payload;

const call = <T>(channel: string, payload?: unknown) =>
  channelCall<T>(electron()?.triesCall, channel, payload, forHttp);

const FILM_TYPE = 'image/webp';

export const diskTries: TryBackend = {
  list: () => call<TryRecord[]>('tries:list'),
  save: async (record, recording) => {
    await call('tries:save', { record, ...(recording ? { recording: packRecording(recording) } : {}) });
  },
  open: async (id) => {
    const opened = await call<{ record: TryRecord; recording: Bytes } | null>('tries:open', id);
    const bytes = bytesOf(opened?.recording);

    return opened && { record: opened.record, recording: bytes && unpackRecording(bytes) };
  },
  remove: async (ids) => (await call<{ deleted: string[] }>('tries:delete', { ids })).deleted,
  film: async (id) => {
    const bytes = bytesOf((await call<{ data: Bytes }>('tries:film', id)).data);

    return bytes && new Blob([bytes as BlobPart], { type: FILM_TYPE });
  },
  saveFilm: async (id, film) => {
    await call('tries:save-film', { id, film: new Uint8Array(await film.arrayBuffer()) });
  },
};
