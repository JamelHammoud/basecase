import { base64ToBytes, bytesToBase64 } from '../utils/base64';
import { channelCall } from '../utils/platform/channelCall';
import { electron } from '../utils/platform/transport';
import type { FrameSetBackend, FrameBytes } from './frameSetStoreTypes';

const forHttp = (payload: unknown) => {
  const frame = payload as Partial<FrameBytes> | undefined;

  return frame?.jpeg instanceof Uint8Array && frame.depth instanceof Uint8Array
    ? { ...(payload as object), jpeg: bytesToBase64(frame.jpeg), depth: bytesToBase64(frame.depth) }
    : payload;
};
const call = <T>(channel: string, payload?: unknown) =>
  channelCall<T>(electron()?.datasetsCall, channel, payload, forHttp);

export const desktopFrameSets: FrameSetBackend = {
  list: () => call('datasets:images-list'),
  manifest: (id) => call('datasets:images-manifest', id),
  jpeg: async (id, frameId) => {
    const jpeg = await call<Uint8Array | { data: string } | null>('datasets:images-jpeg', { id, frameId });

    return jpeg && (jpeg instanceof Uint8Array ? jpeg : base64ToBytes(jpeg.data));
  },
  frame: async (id, frameId) => {
    const frame = await call<FrameBytes | { jpeg: string; depth: string } | null>('datasets:images-frame', {
      id,
      frameId,
    });

    return (
      frame && {
        jpeg: typeof frame.jpeg === 'string' ? base64ToBytes(frame.jpeg) : frame.jpeg,
        depth: typeof frame.depth === 'string' ? base64ToBytes(frame.depth) : frame.depth,
      }
    );
  },
  saveFrame: async (id, frameId, bytes) => {
    await call('datasets:images-save-frame', { id, frameId, ...bytes });
  },
  saveManifest: async (manifest, sourceId) => {
    await call('datasets:images-finalize', { manifest, sourceId });
  },
};
