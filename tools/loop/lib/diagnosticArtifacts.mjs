import { unzipSync, strFromU8 } from 'three/addons/libs/fflate.module.js';
import { ARCHIVE_LIMIT, FILE_LIMIT } from './diagnosticContract.mjs';

export function readDiagnosticArchive(bytes) {
  if (bytes.length > ARCHIVE_LIMIT) throw new Error('Diagnostic archive exceeds 20 MiB');

  let total = 0;
  let count = 0;
  const files = unzipSync(bytes, {
    filter: (entry) => {
      total += entry.originalSize;
      count++;

      if (
        !/^(?:manifest\.json|run-\d+\.(?:json|log))$/.test(entry.name) ||
        (entry.compression === 0 && entry.size !== entry.originalSize) ||
        entry.originalSize > FILE_LIMIT ||
        total > ARCHIVE_LIMIT ||
        count > 61
      ) {
        throw new Error('Diagnostic artifact exceeds file, size or path limits');
      }

      return true;
    },
  });

  return Object.fromEntries(Object.entries(files).map(([name, value]) => [name, strFromU8(value)]));
}
