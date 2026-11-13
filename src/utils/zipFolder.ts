import { zipSync, type Zippable } from 'three/examples/jsm/libs/fflate.module.js';

const STORED = /\.(mp4|parquet)$/;

export function zipFolder(name: string, files: Record<string, Uint8Array>): Uint8Array {
  const entries: Zippable = {};

  for (const [path, bytes] of Object.entries(files)) {
    entries[`${name}/${path}`] = [bytes, { level: STORED.test(path) ? 0 : 6 }];
  }

  return zipSync(entries);
}
