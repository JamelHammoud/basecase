import { checkedModelRef, type ModelRef } from '../../electron/hub/modelPolicy.mjs';
import { hubBridge } from '../hub/hubBridge';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { workerClient } from '../utils/workerRpc';
import type { modelCacheHandlers } from './modelCache';

const webModels = workerClient<typeof modelCacheHandlers>(
  () => new Worker(new URL('./modelCache.worker.ts', import.meta.url), { type: 'module' }),
  async () => {
    throw new Error('Vision model downloads need browser workers.');
  },
);

export async function getVisionModel(manifest: ModelRef): Promise<Uint8Array> {
  const ref = checkedModelRef(manifest);

  if (IS_WEB_DEMO) return webModels.call('get', ref);

  await hubBridge.modelFile(ref);

  return webModels.call('desktop', ref);
}
