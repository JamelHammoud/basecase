import { channelCall } from '../../utils/platform/channelCall';
import { electron } from '../../utils/platform/transport';
import type { DatasetBackend } from './types';
import { bytesToBase64 } from '../../utils/base64';
import {
  checkedDatasetContentHash,
  checkedDatasetContentBytes,
  datasetContentHash,
  verifiedDatasetContent,
} from '../contentHash';
import { datasetContentFromBase64 } from './contentBytes';

const call = <T>(channel: string, payload?: unknown) =>
  channelCall<T>(electron()?.datasetsCall, channel, payload, (value) =>
    value instanceof Uint8Array ? bytesToBase64(value) : value,
  );

export const desktopDatasets: DatasetBackend = {
  saveContent: async (bytes) => {
    const copy = new Uint8Array(checkedDatasetContentBytes(bytes));
    const hash = await datasetContentHash(copy);
    const saved = checkedDatasetContentHash(await call<string>('datasets:content-save', copy));

    if (saved !== hash) throw new Error('Dataset content doesn’t match its hash');

    return hash;
  },
  content: async (hash) => {
    checkedDatasetContentHash(hash);

    const reply = await call<Uint8Array | { data: string } | null>('datasets:content-load', hash);

    if (reply === null) return null;

    const bytes = reply instanceof Uint8Array ? reply : datasetContentFromBase64(reply?.data);

    return verifiedDatasetContent(bytes, hash);
  },
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
