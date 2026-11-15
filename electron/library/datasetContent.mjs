import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_DATASET_CONTENT_BYTES = 1024 * 1024 * 1024;

const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_DATASET_CONTENT_BYTES / 3);
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function checkedHash(hash) {
  if (typeof hash !== 'string' || !HASH_PATTERN.test(hash)) throw new Error('A dataset content hash must be SHA-256');

  return hash;
}

const hashOf = (bytes) => createHash('sha256').update(bytes).digest('hex');

function checkedBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('Dataset content needs bytes');

  if (bytes.byteLength > MAX_DATASET_CONTENT_BYTES) throw new Error('The dataset content is too large');

  return bytes;
}

export function datasetContentBytes(value) {
  if (typeof value !== 'string') return checkedBytes(value);

  if (value.length > MAX_BASE64_LENGTH) throw new Error('The dataset content is too large');

  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('Dataset content needs base64 bytes');
  }

  const bytes = Buffer.from(value, 'base64');

  if (bytes.toString('base64') !== value) throw new Error('Dataset content needs base64 bytes');

  return checkedBytes(bytes);
}

export function loadDatasetContent(dir, hash) {
  const file = path.join(dir, 'content', checkedHash(hash));

  try {
    const stat = fs.lstatSync(file);

    if (!stat.isFile()) throw new Error('Dataset content needs a file');

    if (stat.size > MAX_DATASET_CONTENT_BYTES) throw new Error('The dataset content is too large');

    const bytes = checkedBytes(new Uint8Array(fs.readFileSync(file)));

    if (hashOf(bytes) !== hash) throw new Error('Dataset content doesn’t match its hash');

    return bytes;
  } catch (error) {
    if (error.code === 'ENOENT') return null;

    throw error;
  }
}

export function saveDatasetContent(dir, bytes) {
  const hash = hashOf(checkedBytes(bytes));
  const folder = path.join(dir, 'content');
  const file = path.join(folder, hash);

  fs.mkdirSync(folder, { recursive: true });

  try {
    fs.writeFileSync(file, bytes, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  if (!loadDatasetContent(dir, hash)) throw new Error('Dataset content wasn’t saved');

  return hash;
}
