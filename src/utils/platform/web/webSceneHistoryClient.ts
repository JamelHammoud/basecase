import { workerClient } from '../../workerRpc';
import type { webSceneHistoryHandlers } from './webSceneHistory';

export const webSceneHistory = workerClient<typeof webSceneHistoryHandlers>(
  () => new Worker(new URL('./webSceneHistory.worker.ts', import.meta.url), { type: 'module' }),
  () => import('./webSceneHistory').then((module) => module.webSceneHistoryHandlers),
);
