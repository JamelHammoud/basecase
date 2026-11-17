import { readStoredTry, type StoredTry, type TrySplit } from '../cases/tryFile';
import type { FrozenImageSample } from './snapshotImages';
import { isHash } from '../skills/hash';
import type { Dataset } from './datasetFile';
import { validImageGroups } from '../vision/conditions';

export type SnapshotDataset = Pick<Dataset, 'id' | 'name' | 'createdAt' | 'caseId' | 'sceneId' | 'seed'>;

export interface DatasetSample {
  tryId: string;
  from?: number;
  to?: number;
}

export interface FrozenTrySample {
  tryId: string;
  from: number;
  to: number;
  recording: string;
  source: string;
  split: TrySplit;
  stored: StoredTry;
  excluded: string[];
}

export interface DatasetSnapshot {
  task: string;
  modelHash: string;
  samples: FrozenTrySample[];
  images: FrozenImageSample[];
  context?: string;
  dataset?: SnapshotDataset;
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const frame = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const split = (v: unknown) => v === 'train' || v === 'validation' || v === 'test';
const modelHashFits = (hash: unknown, samples: unknown[]) => isHash(hash) || (hash === '' && samples.length === 0);

export function isDatasetSample(v: unknown): v is DatasetSample {
  if (!object(v) || !id(v.tryId)) return false;

  if (v.from === undefined && v.to === undefined) return true;

  return frame(v.from) && frame(v.to) && v.to > v.from;
}

export const isDatasetSamples = (v: unknown): v is DatasetSample[] =>
  Array.isArray(v) && v.length <= 100_000 && v.every(isDatasetSample);

function frozenSample(v: unknown): v is FrozenTrySample {
  if (!object(v) || !isDatasetSample(v) || !frame(v.from) || !frame(v.to)) return false;

  const raw = v as unknown as FrozenTrySample;
  const stored = readStoredTry(raw.stored);

  return (
    !!stored &&
    stored.id === raw.tryId &&
    raw.to <= stored.frames &&
    isHash(raw.recording) &&
    text(raw.source, 1024) &&
    split(raw.split) &&
    Array.isArray(raw.excluded) &&
    raw.excluded.length <= 110 &&
    raw.excluded.every((r) => text(r, 128))
  );
}

export const isFrozenImageSample = (v: unknown): v is FrozenImageSample =>
  object(v) &&
  id(v.frameSetId) &&
  id(v.frameId) &&
  text(v.source, 1024) &&
  isHash(v.hash) &&
  isHash(v.content) &&
  split(v.split) &&
  (v.explicit === undefined || split(v.explicit)) &&
  (v.groups === undefined || validImageGroups(v.groups));

const frozenDataset = (v: unknown): v is SnapshotDataset =>
  object(v) &&
  id(v.id) &&
  text(v.name, 200) &&
  v.name.trim() !== '' &&
  text(v.createdAt, 64) &&
  (v.caseId === null || id(v.caseId)) &&
  (v.sceneId === null || id(v.sceneId)) &&
  frame(v.seed);

export function readSnapshot(v: unknown): DatasetSnapshot | null {
  if (!object(v) || !text(v.task, 2000)) return null;

  if (v.context !== undefined && !isHash(v.context)) return null;

  if (v.dataset !== undefined && !frozenDataset(v.dataset)) return null;

  const valid =
    Array.isArray(v.samples) &&
    v.samples.length <= 100_000 &&
    v.samples.every(frozenSample) &&
    Array.isArray(v.images) &&
    v.images.length <= 100_000 &&
    v.images.every(isFrozenImageSample) &&
    modelHashFits(v.modelHash, v.samples);

  return valid ? structuredClone(v as unknown as DatasetSnapshot) : null;
}
