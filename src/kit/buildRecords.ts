import type { AtomicUpdate } from '../utils/keyValueAtomic';
import type { ListedStore } from '../utils/keyValueStore';
import { buildStorage } from './buildStorage';
import { isHash } from '../skills/hash';
import { frozenClient } from './frozenClient';
import type { PreparedFrozenKit, FrozenAsset } from './frozenContent';
import { KIT_MAX_BYTES } from './limits';

export interface BuildRecord {
  id: string;
  name: string;
  kit: string;
  createdAt: string;
  count: number;
  index: number;
  completed: Record<string, string>;
}

export type BuildSummary = Omit<BuildRecord, 'index' | 'completed'>;

interface BuildIndex {
  records: BuildSummary[];
  assets: Record<string, number>;
  kits: Record<string, string[]>;
}

export type BuildStorage = Pick<ListedStore<unknown>, 'get'> & { update: AtomicUpdate<unknown> };

function indexOf(value: unknown): BuildIndex {
  if (value === undefined || value === null) return { records: [], assets: {}, kits: {} };

  const index = value as BuildIndex;

  if (!Array.isArray(index.records) || !index.assets || !index.kits) throw new Error('The build history is damaged.');

  return index;
}

function recordOf(value: unknown): BuildRecord {
  const record = value as BuildRecord;

  if (
    !record ||
    typeof record.id !== 'string' ||
    !isHash(record.kit) ||
    !Number.isInteger(record.index) ||
    record.index < 0 ||
    record.index >= record.count ||
    !record.completed ||
    !Number.isInteger(record.count) ||
    record.count < 1 ||
    record.count > 10000
  )
    throw new Error('The build history is damaged.');

  return record;
}

const assetKey = (hash: string) => `asset:${hash}`;
const recordKey = (id: string) => `build:${id}`;

async function readContent(value: unknown) {
  const client = frozenClient();

  if (!value) throw new Error('The build kit is missing.');

  try {
    return await client.call('read', value as PreparedFrozenKit);
  } finally {
    client.dispose();
  }
}

export function createBuildStore(storage: BuildStorage, limits = { maxBytes: KIT_MAX_BYTES, maxBuilds: 100 }) {
  const list = async () => indexOf(await storage.get('index')).records;
  const open = async (id: string) => {
    const record = recordOf(await storage.get(recordKey(id)));

    if (record.id !== id) throw new Error('The build history is damaged.');

    const index = indexOf(await storage.get('index'));
    const hashes = index.kits[record.kit];

    if (!hashes) throw new Error('The build kit is missing.');

    const [root, ...dependencies] = await Promise.all(
      [record.kit, ...hashes].map((hash) => storage.get(assetKey(hash))),
    );
    const content = root as FrozenAsset | undefined;

    if (content?.hash !== record.kit || dependencies.some((asset) => !asset))
      throw new Error('The build kit is missing.');

    const assets = Object.fromEntries(hashes.map((hash, i) => [hash, dependencies[i]]));

    const kit = await readContent({ ...content, assets });

    if (kit.manifest.guide.steps.length !== record.count) throw new Error('The build history is damaged.');

    return { record, kit };
  };
  const create = async (name: string, content: PreparedFrozenKit, signal?: AbortSignal) => {
    signal?.throwIfAborted();

    const kit = await readContent(content);
    const record: BuildRecord = {
      id: crypto.randomUUID(),
      name: name.trim().slice(0, 120) || kit.manifest.design.name,
      kit: content.hash,
      createdAt: new Date().toISOString(),
      count: kit.manifest.guide.steps.length,
      index: 0,
      completed: {},
    };

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

        if (index.records.length >= limits.maxBuilds || bytes > limits.maxBytes)
          throw new Error('Build storage is full. Delete a build to make room.');

        const puts: Record<string, unknown> = {
          index: {
            records: [...index.records, summaryOf(record)],
            assets,
            kits: { ...index.kits, [root.hash]: Object.keys(content.assets) },
          },
          [recordKey(record.id)]: record,
        };

        hashes.forEach((hash, i) => {
          const saved = existing[i] as FrozenAsset | undefined;

          if (saved && saved.text !== incoming[hash].text) throw new Error('The build kit is damaged.');

          if (!saved) puts[assetKey(hash)] = incoming[hash];
        });

        return { puts, result: record };
      },
      signal,
    );
  };

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
      const key = String(checkedStep(record, step));
      const next = { ...record.completed };

      if (completed) next[key] = new Date().toISOString();
      else delete next[key];

      return { ...record, completed: next };
    });
  const remove = (id: string) =>
    storage.update(['index', recordKey(id)], ([value, saved]) => {
      const index = indexOf(value);
      const record = recordOf(saved);
      const records = index.records.filter((item) => item.id !== id);
      const kits = { ...index.kits };

      if (!records.some((item) => item.kit === record.kit)) delete kits[record.kit];

      const retained = new Set(Object.entries(kits).flatMap(([hash, dependencies]) => [hash, ...dependencies]));
      const removed = Object.keys(index.assets).filter((hash) => !retained.has(hash));
      const assets = Object.fromEntries(Object.entries(index.assets).filter(([hash]) => retained.has(hash)));

      return {
        puts: { index: { records, assets, kits } },
        deletes: [recordKey(id), ...removed.map(assetKey)],
        result: undefined,
      };
    });

  return { list, open, create, navigate, complete, remove };
}

function checkedStep(record: BuildRecord, step: number) {
  if (!Number.isInteger(step) || step < 0 || step >= record.count) throw new Error('Choose a build step.');

  return step;
}

export const localBuilds = createBuildStore(buildStorage);

function summaryOf({ id, name, kit, count, createdAt }: BuildRecord): BuildSummary {
  return { id, name, kit, count, createdAt };
}
