import { workerClient } from '../../workerRpc';
import type { WEB_HUB_HANDLERS } from './webHubJob';

export const webHub = workerClient<typeof WEB_HUB_HANDLERS>(
  () => new Worker(new URL('./webHub.worker.ts', import.meta.url), { type: 'module' }),
  async () => {
    if (typeof window !== 'undefined') throw new Error('Worker failed');

    return (await import('./webHubJob')).WEB_HUB_HANDLERS;
  },
);
