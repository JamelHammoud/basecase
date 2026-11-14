import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { checkedFileId } from '../backend/constants.mjs';
import { checkedModelRef, modelAssetPath, modelResolvePath } from './modelPolicy.mjs';

async function cachedChecksum(file, maxBytes) {
  const stat = await fs.stat(file).catch(() => null);

  if (!stat?.isFile() || !stat.size || stat.size > maxBytes) return null;

  const hash = crypto.createHash('sha256');
  let size = 0;

  for await (const chunk of createReadStream(file)) {
    size += chunk.byteLength;

    if (size > maxBytes) return null;

    hash.update(chunk);
  }

  return hash.digest('hex');
}

async function* checkedChunks(source, ref, hash) {
  let size = 0;

  for await (const chunk of source) {
    size += chunk.byteLength;

    if (size > ref.maxBytes) throw new Error('The vision model exceeds its size limit.');

    hash.update(chunk);

    yield chunk;
  }

  if (!size) throw new Error('The vision model download has no bytes.');
}

async function save({ file, response, ref }) {
  if (Number(response.headers.get('content-length')) > ref.maxBytes || !response.body) {
    await response.body?.cancel();

    throw new Error('The vision model exceeds its size limit.');
  }

  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  const hash = crypto.createHash('sha256');

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      (source) => checkedChunks(source, ref, hash),
      createWriteStream(temporary, { flags: 'wx' }),
    );

    if (hash.digest('hex') !== ref.sha256) throw new Error('The vision model checksum doesn’t match its manifest.');

    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export class ModelStore {
  constructor({ dir, client }) {
    this.dir = dir;
    this.client = client;
    this.pending = new Map();
    this.ready = new Map();
  }

  async load(ref) {
    const file = path.join(this.dir, `${checkedFileId(ref.sha256)}.onnx`);

    if ((await cachedChecksum(file, ref.maxBytes)) === ref.sha256) return;

    const response = await this.client().downloadResponse(modelResolvePath(ref));

    await fs.mkdir(this.dir, { recursive: true });
    await save({ file, response, ref });
  }

  async prepare(value) {
    const ref = checkedModelRef(value);
    const key = `${ref.sha256}:${ref.maxBytes}`;
    const promise = this.pending.get(key) ?? this.load(ref).finally(() => this.pending.delete(key));

    this.pending.set(key, promise);
    await promise;
    this.ready.set(ref.sha256, ref.maxBytes);

    return { url: modelAssetPath(ref.sha256) };
  }

  asset(hash) {
    modelAssetPath(hash);

    const maxBytes = this.ready.get(hash);

    return maxBytes ? { file: path.join(this.dir, `${checkedFileId(hash)}.onnx`), maxBytes } : null;
  }
}
