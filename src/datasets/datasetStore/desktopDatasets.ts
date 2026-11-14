import { channelCall } from '../../utils/platform/channelCall';
import { electron } from '../../utils/platform/transport';
import type { DatasetBackend } from './types';

const call = <T>(channel: string, payload?: unknown) => channelCall<T>(electron()?.datasetsCall, channel, payload);

export const desktopDatasets: DatasetBackend = {
  list: async () => {
    const listed = await call<unknown>('datasets:list');

    return Array.isArray(listed) ? listed : [];
  },
  save: async (dataset) => {
    await call('datasets:save', dataset);
  },
  delete: async (ids) => {
    await call('datasets:delete', ids);
  },
};
