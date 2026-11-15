export const MAX_DATASET_CONTENT_BYTES = 1024 * 1024 * 1024;

export function checkedDatasetContentHash(hash: string): string {
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error('A dataset content hash must be SHA-256');
  }

  return hash;
}

export function checkedDatasetContentBytes(bytes: Uint8Array): Uint8Array {
  if (!(bytes instanceof Uint8Array)) throw new Error('Dataset content needs bytes');

  if (bytes.byteLength > MAX_DATASET_CONTENT_BYTES) throw new Error('The dataset content is too large');

  return bytes;
}

export async function datasetContentHash(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(checkedDatasetContentBytes(bytes));
  const hash = await crypto.subtle.digest('SHA-256', copy);

  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifiedDatasetContent(bytes: Uint8Array, hash: string): Promise<Uint8Array> {
  checkedDatasetContentHash(hash);

  const copy = new Uint8Array(checkedDatasetContentBytes(bytes));

  if ((await datasetContentHash(copy)) !== hash) throw new Error('Dataset content doesn’t match its hash');

  return copy;
}
