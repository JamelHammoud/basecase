import type { KitJob } from './types';
import { workerClient } from '../utils/workerRpc';
import { type freezeBuildKit, type PreparedFrozenKit, type FrozenKit } from './frozenKit';
import type { copySourcesFromMeshes } from './frozenCopySources';

type FrozenHandlers = {
  copySources: (input: Parameters<typeof copySourcesFromMeshes>[0]) => Promise<{ result: Record<string, string> }>;
  source: (input: Pick<KitJob, 'parts' | 'project'>) => Promise<{ result: string }>;
  prepare: (input: Parameters<typeof freezeBuildKit>[0]) => Promise<{ result: PreparedFrozenKit }>;
  read: (input: PreparedFrozenKit) => Promise<{ result: FrozenKit }>;
};

export function frozenClient() {
  return workerClient<FrozenHandlers>(
    () => new Worker(new URL('./frozen.worker.ts', import.meta.url), { type: 'module' }),
    async () => {
      if (typeof document !== 'undefined') throw new Error('Kit export needs a worker.');

      const { freezeBuildKit, readFrozenKit } = await import('./frozenKit');
      const { jsonHash } = await import('../utils/geometryHash');
      const { copySourcesFromMeshes } = await import('./frozenCopySources');

      return {
        copySources: async (input) => ({ result: copySourcesFromMeshes(input) }),
        source: async (input) => ({ result: jsonHash(input) }),
        prepare: async (input) => ({ result: await freezeBuildKit(input) }),
        read: async (input) => ({ result: readFrozenKit(input) }),
      };
    },
  );
}

export async function productionCopySources(input: Parameters<typeof copySourcesFromMeshes>[0]) {
  const client = frozenClient();

  try {
    const transfer = Object.values(input.meshes).flatMap((mesh) => [
      mesh.vertices.buffer as ArrayBuffer,
      mesh.indices.buffer as ArrayBuffer,
    ]);

    return await client.call('copySources', input, [...new Set(transfer)]);
  } finally {
    client.dispose();
  }
}

export async function frozenSourceFingerprint(source: Pick<KitJob, 'parts' | 'project'>, signal: AbortSignal) {
  const client = frozenClient();

  signal.throwIfAborted();
  signal.addEventListener('abort', client.dispose, { once: true });

  try {
    return await client.call('source', source);
  } finally {
    signal.removeEventListener('abort', client.dispose);
    client.dispose();
  }
}
