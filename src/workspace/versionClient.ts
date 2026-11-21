import { workerClient } from '../utils/workerRpc';
import type { VersionRequest, VersionComparisonRequest, versionHandlers } from './versionOperations';

const client = workerClient<typeof versionHandlers>(
  () => new Worker(new URL('./sceneVersions.worker.ts', import.meta.url), { type: 'module' }),
  () => import('./versionOperations').then((module) => module.versionHandlers),
);

const encoded = new Map<string, string>();

export function rememberHistory(history: string, quoted: string) {
  if (encoded.size >= 2) encoded.delete(encoded.keys().next().value!);

  encoded.set(history, quoted);
}

export async function historyLiteral(history: string): Promise<string> {
  const cached = encoded.get(history);

  if (cached) return cached;

  const quoted = await client.call('quote', history);

  rememberHistory(history, quoted);

  return quoted;
}
export const versionRequest = (request: VersionRequest) => client.call('operate', request);
export const compareVersionRequest = (request: VersionComparisonRequest) => client.call('compare', request);
