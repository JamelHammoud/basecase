import { workerClient, type WorkerClient } from '../utils/workerRpc';
import type { ReplayRequest, ReplayTrace } from './replayTrace';

type ReplayHandlers = {
  replay: (request: ReplayRequest) => Promise<{ result: ReplayTrace }>;
};

const localHandlers = async (): Promise<ReplayHandlers> => {
  const [{ replayTrace }, { loadedMujoco }] = await Promise.all([import('./replayTrace'), import('./calibrate')]);

  return { replay: async (request) => ({ result: replayTrace(await loadedMujoco(), request) }) };
};

let client: WorkerClient<ReplayHandlers> | null = null;
const cache = new Map<string, Promise<ReplayTrace>>();

const replayer = () =>
  (client ??= workerClient<ReplayHandlers>(
    () => new Worker(new URL('./calibrate.worker.ts', import.meta.url), { type: 'module' }),
    localHandlers,
  ));

export function cachedReplay(key: { logId: string; version: number }, request: ReplayRequest): Promise<ReplayTrace> {
  const id = `${key.logId}:${key.version}`;
  const hit = cache.get(id);

  if (hit) return hit;

  const run = replayer().call('replay', request);

  cache.set(id, run);
  run.catch(() => cache.delete(id));

  return run;
}
