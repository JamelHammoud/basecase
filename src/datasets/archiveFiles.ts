import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { MAX_ENTRIES, safeEntryPath } from '../utils/robotImport/archive';

const MAX_ARCHIVE_BYTES = 1_000_000_000;

export function datasetArchiveFiles(bytes: Uint8Array): Record<string, Uint8Array> {
  let size = 0;
  let root = '';
  const paths = new Set<string>();

  if (bytes.length < 22 || bytes.length > MAX_ARCHIVE_BYTES)
    throw new Error('The dataset export exceeds its size limit.');

  unzipSync(bytes, {
    filter: (entry) => {
      const folder = entry.name.split('/')[0];

      if (
        safeEntryPath(entry.name) !== entry.name ||
        !entry.name.includes('/') ||
        (root && folder !== root) ||
        paths.has(entry.name)
      )
        throw new Error('The dataset export is damaged.');

      root = folder;
      size += entry.originalSize;
      paths.add(entry.name);

      if (size > MAX_ARCHIVE_BYTES || paths.size > MAX_ENTRIES)
        throw new Error('The dataset export exceeds its size limit.');

      return false;
    },
  });

  if (!root) throw new Error('The dataset export is damaged.');

  const files = unzipSync(bytes);

  return Object.fromEntries(Object.entries(files).map(([path, data]) => [path.slice(root.length + 1), data]));
}
