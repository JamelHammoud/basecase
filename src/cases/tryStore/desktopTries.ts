import { decodeTake } from '../../../electron/robot/robotTake.mjs';
import type { Recording } from '../../sim/recorder';
import { base64ToBytes, bytesToBase64 } from '../../utils/base64';
import { channelCall } from '../../utils/platform/channelCall';
import { electron } from '../../utils/platform/transport';
import { decodeRecording, encodeRecording } from '../recordingFile';
import type { StoredTry, TrySummary } from '../tryFile';
import { TRY_VIDEO_PATH, type TryBackend } from './types';

type Bytes = Uint8Array | { data?: string | null } | null | undefined;

const BYTE_FIELDS = ['recording', 'bytes'];

function forHttp(payload: unknown) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload;

  const out: Record<string, unknown> = { ...payload };

  for (const key of BYTE_FIELDS) if (out[key] instanceof Uint8Array) out[key] = bytesToBase64(out[key]);

  return out;
}

const call = <T>(channel: string, payload?: unknown) =>
  channelCall<T>(electron()?.triesCall, channel, payload, forHttp);

function bytesOf(reply: Bytes): Uint8Array | null {
  if (reply instanceof Uint8Array) return reply;

  return typeof reply?.data === 'string' ? base64ToBytes(reply.data) : null;
}

export const desktopTries: TryBackend = {
  list: async () => {
    const listed = await call<TrySummary[]>('tries:list');

    return Array.isArray(listed) ? listed : [];
  },
  save: async (stored: StoredTry, recording: Recording | null) => {
    await call('tries:save', { manifest: stored, recording: recording ? encodeRecording(recording) : null });
  },
  recording: async (id) => {
    const bytes = bytesOf(await call<Bytes>('tries:recording', id));

    return bytes && decodeRecording(bytes);
  },
  strip: async (id) => {
    const bytes = bytesOf(await call<Bytes>('tries:strip', id));

    return bytes && new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/webp' });
  },
  saveStrip: async (id, strip) => {
    await call('tries:keep-strip', { id, bytes: new Uint8Array(await strip.arrayBuffer()) });
  },
  videoUrl: (id) => `${TRY_VIDEO_PATH}${encodeURIComponent(id)}`,
  writeVideo: async (id, position, bytes) =>
    (await call<{ ok?: boolean }>('tries:write-video', { id, position, bytes }))?.ok === true,
  closeVideo: async (id, keep) => (await call<{ ok?: boolean }>('tries:close-video', { id, keep }))?.ok === true,
  take: async (id) => {
    const bytes = bytesOf(await call<Bytes>('tries:recording', id));

    return bytes && decodeTake(bytes);
  },
  saveTake: async (manifest, bytes) => {
    await call('tries:save', { manifest, recording: bytes });
  },
  delete: async (ids) => {
    await call('tries:delete', ids);
  },
};
