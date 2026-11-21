import { isHash } from '../skills/hash';
import type { BuildRecord } from './buildRecords';

export interface PhotoDestination {
  build: string;
  kit: string;
  step: number;
}

export interface BuildPhoto extends PhotoDestination {
  id: string;
  hash: string;
  name: string;
  importedAt: string;
  suppliedModifiedAt?: string;
}

export interface PhotoIndex {
  records: BuildPhoto[];
  assets: Record<string, number>;
}

export const OBSERVATION_LIMITS = { maxBytes: 256 * 1024 * 1024, maxPhotos: 2000, perStep: 20 };
export const photoKey = (hash: string) => `photo:${hash}`;
export const samePhotoStep = (a: PhotoDestination, b: PhotoDestination) =>
  a.build === b.build && a.kit === b.kit && a.step === b.step;
export const photoHistoryError = () => new Error('The build photos are damaged.');

function validPhotoDates(record: BuildPhoto) {
  return (
    typeof record.importedAt === 'string' &&
    record.importedAt.length <= 30 &&
    Number.isFinite(Date.parse(record.importedAt)) &&
    (record.suppliedModifiedAt === undefined ||
      (typeof record.suppliedModifiedAt === 'string' &&
        record.suppliedModifiedAt.length <= 30 &&
        Number.isFinite(Date.parse(record.suppliedModifiedAt))))
  );
}

function validPhoto(record: BuildPhoto) {
  return (
    record &&
    typeof record.id === 'string' &&
    record.id.length <= 100 &&
    typeof record.build === 'string' &&
    record.build.length <= 100 &&
    isHash(record.kit) &&
    isHash(record.hash) &&
    Number.isInteger(record.step) &&
    record.step >= 0 &&
    record.step < 10000 &&
    typeof record.name === 'string' &&
    record.name.length <= 120 &&
    validPhotoDates(record)
  );
}

export function photoIndex(value: unknown): PhotoIndex {
  if (value === undefined || value === null) return { records: [], assets: {} };

  const index = value as PhotoIndex;

  if (
    !Array.isArray(index.records) ||
    index.records.length > OBSERVATION_LIMITS.maxPhotos ||
    !index.records.every(validPhoto) ||
    !index.assets ||
    typeof index.assets !== 'object' ||
    !Object.entries(index.assets).every(([hash, bytes]) => isHash(hash) && Number.isSafeInteger(bytes) && bytes > 0) ||
    index.records.some((record) => !index.assets[record.hash])
  )
    throw photoHistoryError();

  return index;
}

export function checkedPhotoDestination(saved: unknown, destination: PhotoDestination) {
  const build = saved as BuildRecord | undefined;

  if (
    !build ||
    build.id !== destination.build ||
    build.kit !== destination.kit ||
    !isHash(destination.kit) ||
    !Number.isInteger(build.count) ||
    build.count < 1 ||
    build.count > 10000 ||
    !Number.isInteger(destination.step) ||
    destination.step < 0 ||
    destination.step >= build.count
  )
    throw photoHistoryError();
}

export function prunePhotos(index: PhotoIndex, keep: (record: BuildPhoto) => boolean) {
  const records = index.records.filter(keep);
  const retained = new Set(records.map((record) => record.hash));
  const assets = Object.fromEntries(Object.entries(index.assets).filter(([hash]) => retained.has(hash)));
  const deletes = Object.keys(index.assets)
    .filter((hash) => !retained.has(hash))
    .map(photoKey);

  return { puts: { observations: { records, assets } }, deletes };
}

export function photoName(value: string) {
  return (
    value
      .slice(0, 512)
      .split('')
      .filter((char) => char.charCodeAt(0) >= 32 && !/[\u007f-\u009f\u202a-\u202e\u2066-\u2069/\\]/.test(char))
      .join('')
      .trim()
      .slice(0, 120) || 'Photo'
  );
}
