import { MB } from '../../../electron/fileSize.mjs';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';

export const MAX_UNPACKED_BYTES = 600 * MB;
export const MAX_ENTRIES = 20_000;
export const ZIP_TOO_LARGE = 'That zip is too large. Unzip it and choose the folder.';

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

export function safeEntryPath(name: string): string | null {
  const slashed = name.replace(/\\/g, '/');

  if (slashed.startsWith('/') || /^[a-zA-Z]:/.test(slashed) || slashed.includes('\0')) return null;

  const segments = slashed.split('/').filter((s) => s && s !== '.');

  if (!segments.length || segments.includes('..') || segments[0] === '__MACOSX') return null;

  return segments.join('/');
}

export function unzipEntries(bytes: Uint8Array): ZipEntry[] {
  let unpacked = 0;
  let count = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      if (file.name.endsWith('/') || !safeEntryPath(file.name)) return false;

      unpacked += file.originalSize;
      count++;

      if (unpacked > MAX_UNPACKED_BYTES || count > MAX_ENTRIES) throw new Error(ZIP_TOO_LARGE);

      return true;
    },
  });

  return Object.entries(files).map(([name, data]) => ({ path: safeEntryPath(name)!, data }));
}
