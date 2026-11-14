import { GB, MB } from '../fileSize.mjs';

export const DATASET_INFO = 'meta/info.json';
export const DATASET_FILE_BYTES = 256 * MB;
export const DATASET_TOTAL_BYTES = GB;
export const DATASET_FILES_MAX = 2000;

const SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,128}$/;
const PATH_MAX = 300;
const DOWNLOADED = [/^meta\/[^/]+\.jsonl?$/, /^meta\/.+\.parquet$/, /^data\/.+\.parquet$/];

const OVER_TOTAL = 'That dataset is over 1 GB. Download it and import the folder.';
const OVER_COUNT = 'That dataset has over 2,000 files. Download it and import the folder.';

export const isPlainPath = (path) =>
  typeof path === 'string' && path.length <= PATH_MAX && path.split('/').every((s) => SEGMENT.test(s));

export const isDatasetDownload = (path) => isPlainPath(path) && DOWNLOADED.some((pattern) => pattern.test(path));

export const encodedPath = (path) => path.split('/').map(encodeURIComponent).join('/');

export function datasetDownloads(entries) {
  const picked = entries.filter((entry) => isDatasetDownload(entry.path));

  if (!picked.some((entry) => entry.path === DATASET_INFO)) return [];

  if (picked.length > DATASET_FILES_MAX) throw new Error(OVER_COUNT);

  if (picked.reduce((sum, entry) => sum + entry.size, 0) > DATASET_TOTAL_BYTES) throw new Error(OVER_TOTAL);

  return picked;
}

export async function downloadDataset(client, { id, rev }) {
  const revision = await client.revisionSha(id, rev);
  const files = {};
  let total = 0;

  for (const { path } of datasetDownloads(await client.listTree(id, revision))) {
    const bytes = await client.download(`${client.root}/${id}/resolve/${revision}/${encodedPath(path)}`, {
      maxBytes: DATASET_FILE_BYTES,
      label: path,
    });

    total += bytes.byteLength;

    if (total > DATASET_TOTAL_BYTES) throw new Error(OVER_TOTAL);

    files[path] = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  return { repo: id, revision, files };
}
