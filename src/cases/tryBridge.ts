import { base64ToBytes, bytesToBase64 } from '../utils/base64';
import { channelCall } from '../utils/platform/channelCall';
import { electron } from '../utils/platform/transport';
import { decodeRecording, encodeRecording } from './recordingFile';
import type { StoredTry } from './storedTry';
import type { TryBackend } from './tryBackend';

interface SavePayload {
  manifest: StoredTry;
  recording?: Uint8Array;
  film?: Uint8Array;
}

type Bytes = Uint8Array | string | null;

const base64Of = (bytes: Uint8Array | undefined) => (bytes ? bytesToBase64(bytes) : undefined);

const forHttp = (payload: unknown) => {
  if (!payload || typeof payload !== 'object' || !('manifest' in payload)) return payload;

  const { manifest, recording, film } = payload as SavePayload;

  return { manifest, recording: base64Of(recording), film: base64Of(film) };
};

const call = <T>(channel: string, payload?: unknown) =>
  channelCall<T>(electron()?.triesCall, channel, payload, forHttp);

const bytesOf = (reply: Bytes) => {
  if (!reply) return null;

  return typeof reply === 'string' ? base64ToBytes(reply) : new Uint8Array(reply);
};

export const bridgeTries: TryBackend = {
  list: () => call<StoredTry[]>('tries:list'),
  save: async ({ manifest, recording, film }) => {
    await call('tries:save', {
      manifest,
      recording: recording && encodeRecording(recording),
      film: film && new Uint8Array(await film.arrayBuffer()),
    } satisfies SavePayload);
  },
  recording: async (id) => {
    const bytes = bytesOf(await call<Bytes>('tries:recording', id));

    return bytes && decodeRecording(bytes);
  },
  film: async (id) => {
    const bytes = bytesOf(await call<Bytes>('tries:film', id));

    return bytes && new Blob([bytes.slice()], { type: 'image/webp' });
  },
  remove: async (ids) => {
    await call('tries:delete', ids);
  },
};
