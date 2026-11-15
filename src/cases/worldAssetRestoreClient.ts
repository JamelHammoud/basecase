import { workerClient } from '../utils/workerRpc';
import type { worldAssetRestoreHandlers } from './worldAssetRestore';

export async function restoreWorldAssetsInWorker(value: unknown) {
  const client = workerClient<typeof worldAssetRestoreHandlers>(
    () => new Worker(new URL('./worldAssetRestore.worker.ts', import.meta.url), { type: 'module' }),
    async () => {
      if (typeof window !== 'undefined') throw new Error('World restore worker is unavailable.');

      return (await import('./worldAssetRestore')).worldAssetRestoreHandlers;
    },
  );

  return client.call('restoreWorldAssets', value).finally(client.dispose);
}
