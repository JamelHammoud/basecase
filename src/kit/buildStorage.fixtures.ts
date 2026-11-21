import type { AtomicChanges } from '../utils/keyValueAtomic';

export function memoryBuildStorage() {
  const values = new Map<string, unknown>();
  let queue = Promise.resolve();
  let interrupted = false;
  const update = <R>(keys: string[], change: (values: unknown[]) => AtomicChanges<unknown, R>): Promise<R> => {
    const operation = queue.then(() => {
      const changes = change(keys.map((key) => structuredClone(values.get(key))));

      if (interrupted) {
        interrupted = false;

        throw new Error('Interrupted save');
      }

      for (const [key, value] of Object.entries(changes.puts)) values.set(key, structuredClone(value));

      for (const key of changes.deletes ?? []) values.delete(key);

      return changes.result;
    });

    queue = operation.then(
      () => undefined,
      () => undefined,
    );

    return operation;
  };

  return {
    get: async (key: string) => structuredClone(values.get(key)),
    update,
    interrupt: () => {
      interrupted = true;
    },
    assetBytes: () =>
      [...values.entries()]
        .filter(([key]) => key.startsWith('asset:'))
        .reduce((sum, [, value]) => sum + (value as { bytes: number }).bytes, 0),
    damage: (hash: string, fault: 'missing' | 'corrupt') => {
      const key = `asset:${hash}`;

      if (fault === 'missing') values.delete(key);
      else values.set(key, { ...(values.get(key) as object), text: '{}' });
    },
  };
}
