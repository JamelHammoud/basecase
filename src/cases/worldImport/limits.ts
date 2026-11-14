import { asNumber, asRecord, refuse } from '../validate';
import type { WorldImportFile } from '../worldImportTypes';

export const MAX_WORLD_BYTES = 64 * 1024 * 1024;
export const MAX_WORLD_TRIANGLES = 200000;
export const MAX_WORLD_VERTICES = 600000;
export const MAX_WORLD_SPLATS = 1000000;
export const MAX_WORLD_COORDINATE = 500000;
export const DEFAULT_MATERIAL = {
  name: 'World',
  color: [1, 1, 1, 1] as [number, number, number, number],
  roughness: 0.8,
  metalness: 0,
};

export const record = (value: unknown) => asRecord(value, 'World');
export const finite = (value: unknown) => asNumber(value, 'World coordinate');

export function integer(value: unknown, max = MAX_WORLD_BYTES): number {
  const n = finite(value);

  return Number.isSafeInteger(n) && n >= 0 && n <= max ? n : refuse('World', 'has an out-of-range index or count');
}

export function list(value: unknown, max = 4096): unknown[] {
  if (!Array.isArray(value) || value.length > max) return refuse('World', 'has an oversized or missing list');

  return value;
}

export function item(value: unknown, index: unknown): Record<string, unknown> {
  const values = list(value);

  return record(values[integer(index, values.length - 1)]);
}

export function safePath(path: string): string {
  let decoded: string;

  try {
    decoded = decodeURIComponent(path);
  } catch {
    return refuse('World resource', 'has an unreadable name');
  }

  if (
    !decoded ||
    decoded.length > 240 ||
    /[:\\?#]/.test(decoded) ||
    Array.from(decoded).some((c) => c.charCodeAt(0) < 32) ||
    decoded.startsWith('/') ||
    decoded.split('/').some((p) => !p || p === '.' || p === '..')
  )
    return refuse('World resource', 'must name a dropped file');

  return decoded;
}

export function droppedFiles(files: WorldImportFile[]): Map<string, Uint8Array> {
  if (!files.length || files.length > 256) return refuse('World', 'needs up to 256 dropped files');

  const map = new Map<string, Uint8Array>();
  let bytes = 0;

  for (const file of files) {
    const path = safePath(file.name);

    bytes += file.bytes.byteLength;

    if (bytes > MAX_WORLD_BYTES) return refuse('World', 'is over 64 MB');

    if (map.has(path)) return refuse('World', 'has repeated file names');

    map.set(path, file.bytes);
  }

  return map;
}

export function resource(uri: unknown, context: { name: string; files: Map<string, Uint8Array> }): Uint8Array {
  if (typeof uri !== 'string') return refuse('World resource', 'must name a dropped file');

  const path = safePath(uri);
  const parent = context.name.includes('/') ? context.name.slice(0, context.name.lastIndexOf('/') + 1) : '';
  const data = context.files.get(parent + path);

  return data ?? refuse('World resource', 'must be included in the drop');
}
