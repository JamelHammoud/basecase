import { fileSize, MB } from '../../electron/fileSize.mjs';
import { CaseFileError } from './validate';

export const MAX_WORLD_FILE_BYTES = 300 * MB;
export const MAX_WORLD_DROP_BYTES = 600 * MB;
export const MAX_WORLD_TRIANGLES = 500_000;
export const MAX_WORLD_VERTICES = 3 * MAX_WORLD_TRIANGLES;
export const MAX_SPLAT_POINTS = 3_000_000;

export interface RawMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface SizedFile {
  name: string;
  byteLength: number;
}

export const worldRefuse = (message: string): never => {
  throw new CaseFileError(message);
};

export const damaged = (name: string): never => worldRefuse(`${name} is damaged.`);

export const withCommas = (n: number) => n.toLocaleString('en-US');

export const tooManyTriangles = (name: string): never =>
  worldRefuse(`${name} has over ${withCommas(MAX_WORLD_TRIANGLES)} triangles.`);

export const notANumber = (name: string): never => worldRefuse(`${name} has a vertex that isn’t a number.`);

export function checkWorldSizes(files: SizedFile[]) {
  const big = files.find((f) => f.byteLength > MAX_WORLD_FILE_BYTES);

  if (big) worldRefuse(`${big.name} is over ${fileSize(MAX_WORLD_FILE_BYTES)}.`);

  const total = files.reduce((sum, f) => sum + f.byteLength, 0);

  if (total > MAX_WORLD_DROP_BYTES) worldRefuse(`These files are over ${fileSize(MAX_WORLD_DROP_BYTES)} together.`);
}

export const fileExtension = (name: string) => {
  const dot = name.lastIndexOf('.');

  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const recordOf = (value: unknown, name: string): Record<string, unknown> =>
  isRecord(value) ? value : damaged(name);

export const listOf = (value: unknown, name: string): unknown[] => {
  if (value === undefined) return [];

  return Array.isArray(value) ? value : damaged(name);
};

export const wholeOf = (value: unknown, name: string): number =>
  Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : damaged(name);

export const wholeOr = (value: unknown, fallback: number, name: string): number =>
  value === undefined ? fallback : wholeOf(value, name);

export const finiteList = (value: unknown, length: number, name: string): number[] => {
  const list = listOf(value, name);

  return list.length === length && list.every(Number.isFinite) ? (list as number[]) : damaged(name);
};

export const allFinite = (values: ArrayLike<number>) => {
  for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i])) return false;

  return true;
};

export function concatenated<T extends Float32Array | Uint32Array | Uint8Array>(
  parts: T[],
  make: (length: number) => T,
): T {
  const out = make(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;

  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }

  return out;
}
