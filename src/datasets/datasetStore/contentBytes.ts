import { base64ToBytes, bytesToBase64 } from '../../utils/base64';
import { checkedDatasetContentBytes, MAX_DATASET_CONTENT_BYTES } from '../contentHash';

const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_DATASET_CONTENT_BYTES / 3);

export function datasetContentFromBase64(value: unknown): Uint8Array {
  if (typeof value !== 'string') throw new Error('Dataset content needs base64 bytes');

  if (value.length > MAX_BASE64_LENGTH) throw new Error('The dataset content is too large');

  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('Dataset content needs base64 bytes');
  }

  const bytes = checkedDatasetContentBytes(base64ToBytes(value));

  if (bytesToBase64(bytes) !== value) throw new Error('Dataset content needs base64 bytes');

  return bytes;
}
