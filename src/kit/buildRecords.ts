import { buildStorage } from './buildStorage';
import { KIT_MAX_BYTES } from './limits';
import { photoIndex, prunePhotos } from './photoRecords';
import type { PreparedFrozenKit, FrozenAsset } from './frozenContent';
import { indexOf, recordOf, recordKey, assetKey, readContent, storedBuildContent, summaryOf } from './buildPersistence';
import type { BuildStorage, BuildRecord } from './buildPersistence';
import { currentBuildRepair } from './buildRepairState';
import { createBuildRepairOperations } from './buildRepairRecords';

export type { BuildRecord, BuildStorage, BuildSummary } from './buildPersistence';

export function createBuildStore(storage: BuildStorage, limits = { maxBytes: KIT_MAX_BYTES, maxBuilds: 100 }) {
  const list = async () => indexOf(await storage.get('index')).records;
  const open = async (id: string) => {
    const record = recordOf(await storage.get(recordKey(id)));

    if (record.id !== id) throw new Error('The build history is damaged.');

    const hash = record.configuration ?? record.kit;
    const content = await storedBuildContent(storage, hash);
    const kit = await readContent(content);

    if (!record.configuration && kit.manifest.guide.steps.length !== record.count)
      throw new Error('The build history is damaged.');

    return { record, kit };
  };
  const createMany = async (names: string[], content: PreparedFrozenKit, signal?: AbortSignal) => {
    const requested = [...names];

    signal?.throwIfAborted();

    if (requested.length < 1 || requested.length > 20) throw new Error('Choose 1 to 20 builds.');

    const kit = await readContent(content);
    const createdAt = new Date().toISOString();
    const records: BuildRecord[] = requested.map((name) => ({
      id: crypto.randomUUID(),
      name: name.trim().slice(0, 120) || kit.manifest.design.name,
      kit: content.hash,
      createdAt,
      count: kit.manifest.guide.steps.length,
      index: 0,
      completed: {},
    }));

    signal?.throwIfAborted();

    const root = { hash: content.hash, bytes: content.bytes, text: content.text };
    const incoming = { ...content.assets, [root.hash]: root };
    const hashes = Object.keys(incoming);

    return storage.update(
      ['index', ...hashes.map(assetKey)],
      ([value, ...existing]) => {
        signal?.throwIfAborted();

        const index = indexOf(value);
        const assets = { ...index.assets, ...Object.fromEntries(hashes.map((hash) => [hash, incoming[hash].bytes])) };
        const bytes = Object.values(assets).reduce((sum, size) => sum + size, 0);

        if (index.records.length + records.length > limits.maxBuilds || bytes > limits.maxBytes)
          throw new Error('Build storage is full. Delete a build to make room.');

        const puts: Record<string, unknown> = {
          index: {
            records: [...index.records, ...records.map(summaryOf)],
            assets,
            kits: { ...index.kits, [root.hash]: Object.keys(content.assets) },
          },
          ...Object.fromEntries(records.map((record) => [recordKey(record.id), record])),
        };

        hashes.forEach((hash, i) => {
          const saved = existing[i] as FrozenAsset | undefined;

          if (saved && saved.text !== incoming[hash].text) throw new Error('The build kit is damaged.');

          if (!saved) puts[assetKey(hash)] = incoming[hash];
        });

        return { puts, result: records };
      },
      signal,
    );
  };
  const create = async (name: string, content: PreparedFrozenKit, signal?: AbortSignal) =>
    (await createMany([name], content, signal))[0];

  const update = (id: string, change: (record: BuildRecord) => BuildRecord) =>
    storage.update([recordKey(id)], ([saved]) => {
      const record = change(recordOf(saved));

      if (record.id !== id) throw new Error('The build history is damaged.');

      return { puts: { [recordKey(id)]: record }, result: record };
    });
  const navigate = (id: string, step: number) =>
    update(id, (record) => ({ ...record, index: checkedStep(record, step) }));
  const complete = (id: string, step: number, completed: boolean) =>
    update(id, (record) => {
      if (record.repairs?.length) throw new Error('The original assembly history is read-only.');

      const key = String(checkedStep(record, step));
      const next = { ...record.completed };

      if (completed) next[key] = new Date().toISOString();
      else delete next[key];

      return { ...record, completed: next };
    });
  const remove = (id: string) =>
    storage.update(['index', recordKey(id), 'observations'], ([value, saved, observations]) => {
      const index = indexOf(value);
      const record = recordOf(saved);
      const records = index.records.filter((item) => item.id !== id);
      const kits = { ...index.kits };

      const repair = currentBuildRepair(record);

      if (repair && repair.state !== 'cancelled') throw new Error('Finish the repair before deleting this build.');

      const roots = new Set(records.flatMap((item) => item.retained ?? [item.kit]));

      for (const hash of Object.keys(kits)) if (!roots.has(hash)) delete kits[hash];

      const retained = new Set(Object.entries(kits).flatMap(([hash, dependencies]) => [hash, ...dependencies]));
      const removed = Object.keys(index.assets).filter((hash) => !retained.has(hash));
      const assets = Object.fromEntries(Object.entries(index.assets).filter(([hash]) => retained.has(hash)));
      const photos = prunePhotos(photoIndex(observations), (photo) => photo.build !== id);

      return {
        puts: { index: { records, assets, kits }, ...photos.puts },
        deletes: [recordKey(id), ...removed.map(assetKey), ...photos.deletes],
        result: undefined,
      };
    });

  return {
    list,
    open,
    create,
    createMany,
    navigate,
    complete,
    remove,
    ...createBuildRepairOperations(storage, limits),
  };
}

function checkedStep(record: BuildRecord, step: number) {
  if (!Number.isInteger(step) || step < 0 || step >= record.count) throw new Error('Choose a build step.');

  return step;
}

export const localBuilds = createBuildStore(buildStorage);
