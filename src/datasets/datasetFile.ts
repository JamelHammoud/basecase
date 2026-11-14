import { sha256 } from '../cases/tries';
import type { TrySummary } from '../cases/tryFile';

export const DATASET_FILE_VERSION = 1;

const MAX_MEMBERS = 100_000;
const MAX_VERSIONS = 100;
const SAFE_ID = /^[\w-]{1,128}$/;

export interface DatasetVersion {
  n: number;
  hash: string;
  at: string;
  members: string[];
}

export interface Dataset {
  version: typeof DATASET_FILE_VERSION;
  id: string;
  name: string;
  task: string;
  sceneId: string | null;
  caseId: string | null;
  query: string | null;
  members: string[];
  seed: number;
  versions: DatasetVersion[];
  createdAt: string;
}

export interface NewDataset {
  id: string;
  name: string;
  task: string;
  sceneId?: string | null;
  caseId?: string | null;
  query?: string | null;
  members: string[];
  at: string;
}

export function seedOf(text: string): number {
  let h = 0x811c9dc5;

  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;

  return h;
}

const unique = (ids: string[]) => [...new Set(ids)];

const safeIdOrNull = (id: string | null | undefined) => (id && SAFE_ID.test(id) ? id : null);

export function newDataset(made: NewDataset): Dataset {
  return {
    version: DATASET_FILE_VERSION,
    id: made.id,
    name: made.name,
    task: made.task,
    sceneId: safeIdOrNull(made.sceneId),
    caseId: safeIdOrNull(made.caseId),
    query: made.query?.trim() || null,
    members: unique(made.members),
    seed: seedOf(made.id),
    versions: [],
    createdAt: made.at,
  };
}

export const addMembers = (dataset: Dataset, ids: string[]): Dataset => ({
  ...dataset,
  members: unique([...dataset.members, ...ids]),
});

export const withMembers = (dataset: Dataset, ids: string[]): Dataset => ({ ...dataset, members: unique(ids) });

export async function versionHash(dataset: Pick<Dataset, 'task' | 'members'>, tries: TrySummary[]): Promise<string> {
  const byId = new Map(tries.map((t) => [t.id, t]));
  const members = dataset.members.map((id) => {
    const t = byId.get(id);

    return t ? [id, t.modelHash, t.frames, t.outcome.verdict] : [id];
  });

  return sha256(JSON.stringify({ task: dataset.task, members }));
}

export const newestVersion = (dataset: Dataset): DatasetVersion | null => dataset.versions.at(-1) ?? null;

export function freezeVersion(
  dataset: Dataset,
  hash: string,
  at: string,
): { dataset: Dataset; version: DatasetVersion } {
  const last = newestVersion(dataset);

  if (last?.hash === hash) return { dataset, version: last };

  const version = { n: (last?.n ?? 0) + 1, hash, at, members: [...dataset.members] };

  return { dataset: { ...dataset, versions: [...dataset.versions, version].slice(-MAX_VERSIONS) }, version };
}

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = 512): v is string => typeof v === 'string' && v.length <= max;
const isId = (v: unknown): v is string => typeof v === 'string' && SAFE_ID.test(v);
const isIdOrNull = (v: unknown) => v === null || isId(v);
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.length <= MAX_MEMBERS && v.every(isId);
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

const readVersion = (v: unknown): DatasetVersion | null =>
  isObject(v) && isCount(v.n) && v.n > 0 && isText(v.hash, 128) && isText(v.at, 64) && isIds(v.members)
    ? { n: v.n, hash: v.hash, at: v.at, members: v.members }
    : null;

const hasFields = (v: Raw) =>
  v.version === DATASET_FILE_VERSION &&
  isId(v.id) &&
  isText(v.name, 200) &&
  v.name.trim() !== '' &&
  isText(v.task, 2000) &&
  isIdOrNull(v.sceneId) &&
  isIdOrNull(v.caseId) &&
  (v.query === null || isText(v.query, 500)) &&
  isIds(v.members) &&
  isCount(v.seed) &&
  isText(v.createdAt, 64) &&
  Array.isArray(v.versions) &&
  v.versions.length <= MAX_VERSIONS;

export function readDataset(value: unknown): Dataset | null {
  if (!isObject(value) || !hasFields(value)) return null;

  const versions = (value.versions as unknown[]).map(readVersion);

  if (versions.some((v) => !v)) return null;

  return {
    version: DATASET_FILE_VERSION,
    id: value.id as string,
    name: value.name as string,
    task: value.task as string,
    sceneId: value.sceneId as string | null,
    caseId: value.caseId as string | null,
    query: value.query as string | null,
    members: unique(value.members as string[]),
    seed: value.seed as number,
    versions: versions as DatasetVersion[],
    createdAt: value.createdAt as string,
  };
}
