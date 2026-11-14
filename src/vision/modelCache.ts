import type { ModelRef } from '../../electron/hub/modelPolicy.mjs';
import { idbDelete, idbGet, idbPut } from '../utils/platform/web/idb';
import { reply } from '../utils/workerRpc';
import { cachedDesktopModel, createModelStore } from './modelDownload';

const getModel = createModelStore({
  cache: {
    get: (hash) => idbGet<Uint8Array>('vision-models', hash),
    put: (hash, bytes) => idbPut('vision-models', hash, bytes),
    delete: (hash) => idbDelete('vision-models', hash),
  },
});

export const modelCacheHandlers = {
  desktop: async (ref: ModelRef) => {
    const bytes = await cachedDesktopModel(ref);

    return reply(bytes, [bytes.buffer]);
  },
  get: async (ref: ModelRef) => {
    const bytes = await getModel(ref);

    return reply(bytes, [bytes.buffer]);
  },
};
