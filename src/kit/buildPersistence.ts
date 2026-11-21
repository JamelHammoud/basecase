import type { AtomicUpdate } from '../utils/keyValueAtomic';
import type { ListedStore } from '../utils/keyValueStore';
import { validBuildRepairs } from './buildRepairValidation';
import { isHash } from '../skills/hash';
import { frozenClient } from './frozenClient';
import type { PreparedFrozenKit, FrozenAsset } from './frozenContent';

export interface BuildRecord {
  id: string;
  name: string;
  kit: string;
  createdAt: string;
  count: number;
  index: number;
  completed: Record<string, string>;
  configuration?: string;
  retained?: string[];
  repairs?: import('./buildRepairTypes').BuildRepairRecord[];
}

export type BuildSummary = Omit<BuildRecord, 'index' | 'completed' | 'repairs'>;

export interface BuildIndex {
  records: BuildSummary[];
  assets: Record<string, number>;
  kits: Record<string, string[]>;
}

export type BuildStorage = Pick<ListedStore<unknown>, 'get'> & { update: AtomicUpdate<unknown> };

export function indexOf(value: unknown): BuildIndex {
  if (value === undefined || value === null) return { records: [], assets: {}, kits: {} };

  const index = value as BuildIndex;

  if (
    !Array.isArray(index.records) ||
    !index.records.every(validSummary) ||
    new Set(index.records.map((record) => record.id)).size !== index.records.length ||
    !index.assets ||
    !index.kits
  )
    throw new Error('The build history is damaged.');

  return index;
}

export function recordOf(value: unknown): BuildRecord {
  const record = value as BuildRecord;

  if (
    !validSummary(record) ||
    !Number.isInteger(record.index) ||
    record.index < 0 ||
    record.index >= record.count ||
    !validCompletion(record) ||
    !validBuildRepairs(record.repairs) ||
    !validRepairOwnership(record) ||
    (record.configuration !== undefined && !isHash(record.configuration))
  )
    throw new Error('The build history is damaged.');

  return record;
}

function validSummary(record: BuildSummary) {
  return (
    !!record &&
    typeof record.id === 'string' &&
    !!record.id &&
    typeof record.name === 'string' &&
    !!record.name.trim() &&
    isHash(record.kit) &&
    validTimestamp(record.createdAt) &&
    Number.isInteger(record.count) &&
    record.count >= 1 &&
    record.count <= 10000
  );
}

function validTimestamp(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validCompletion(record: BuildRecord) {
  if (!record.completed || typeof record.completed !== 'object' || Array.isArray(record.completed)) return false;

  return Object.entries(record.completed).every(([key, timestamp]) => {
    const step = Number(key);

    return (
      String(step) === key && Number.isInteger(step) && step >= 0 && step < record.count && validTimestamp(timestamp)
    );
  });
}

export const assetKey = (hash: string) => `asset:${hash}`;
export const recordKey = (id: string) => `build:${id}`;

export async function readContent(value: unknown) {
  const client = frozenClient();

  if (!value) throw new Error('The build kit is missing.');

  try {
    return await client.call('read', value as PreparedFrozenKit);
  } finally {
    client.dispose();
  }
}

export async function storedBuildContent(storage: BuildStorage, hash: string) {
  const index = indexOf(await storage.get('index'));
  const hashes = index.kits[hash];

  if (!hashes) throw new Error('The build kit is missing.');

  const [root, ...assets] = await Promise.all([hash, ...hashes].map((key) => storage.get(assetKey(key))));
  const content = root as FrozenAsset | undefined;

  if (content?.hash !== hash || assets.some((asset) => !asset)) throw new Error('The build kit is missing.');

  return { ...content, assets: Object.fromEntries(hashes.map((key, i) => [key, assets[i] as FrozenAsset])) };
}

export function summaryOf({ id, name, kit, count, createdAt, configuration, retained }: BuildRecord): BuildSummary {
  return { id, name, kit, count, createdAt, ...(configuration && { configuration }), ...(retained && { retained }) };
}

function validRepairOwnership(record: BuildRecord) {
  return (
    record.repairs === undefined ||
    record.repairs.every(
      (repair) =>
        repair.build === record.id &&
        (record.retained ?? []).includes(repair.source) &&
        (record.retained ?? []).includes(repair.target),
    )
  );
}
