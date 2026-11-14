import { channelCall } from '../utils/platform/channelCall';
import { electron } from '../utils/platform/transport';
import { createWebFrameSets } from './frameSetWebStore';

export interface StoredManifest {
  manifest: string;
  createdAt: string;
}
export interface FrameSetBackend {
  list: () => Promise<unknown[]>;
  read: (id: string) => Promise<StoredManifest | null>;
  frame: (id: string) => Promise<string | null>;
  save: (data: string) => Promise<void>;
  saveFrame: (id: string, data: string) => Promise<void>;
}

const call = <T>(channel: string, payload?: unknown) => channelCall<T>(electron()?.datasetsCall, channel, payload);

export const desktopFrameSets: FrameSetBackend = {
  list: () => call('datasets:frame-sets'),
  read: (id) => call('datasets:frame-set-read', id),
  frame: (id) => call('datasets:frame-read', id),
  save: async (data) => {
    await call('datasets:frame-set-save', data);
  },
  saveFrame: async (id, data) => {
    await call('datasets:frame-save', { id, data });
  },
};
export const webFrameSets = createWebFrameSets();
