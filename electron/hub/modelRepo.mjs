import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { checkedName } from './publishRepo.mjs';

export const MODEL_FILE_BYTES = 256 * 1024 * 1024;

const SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,128}$/;

export function checkedModel(value) {
  const model = value ?? {};
  const owner = checkedName(model.owner);
  const repo = checkedName(model.repo);

  if (!/^[a-f0-9]{40}$/.test(model.revision ?? '')) throw new Error('The model needs a pinned commit.');

  if (!/^[a-f0-9]{64}$/.test(model.sha256 ?? '')) throw new Error('The model needs a SHA256 hash.');

  if (!Number.isInteger(model.bytes) || model.bytes < 1 || model.bytes > MODEL_FILE_BYTES)
    throw new Error('The model exceeds the download limit.');

  if (
    typeof model.file !== 'string' ||
    model.file.length > 300 ||
    !model.file.endsWith('.onnx') ||
    !model.file.split('/').every((s) => SEGMENT.test(s))
  )
    throw new Error('Choose an ONNX file inside the model repo.');

  return { ...model, owner, repo };
}

const matches = (bytes, model) =>
  bytes.byteLength === model.bytes && crypto.createHash('sha256').update(bytes).digest('hex') === model.sha256;

async function cached(file, model) {
  const info = await fs.lstat(file).catch(() => null);

  if (!info?.isFile() || info.size !== model.bytes) return null;

  const bytes = await fs.readFile(file);

  return matches(bytes, model) ? bytes : null;
}

export async function downloadModel(client, { libraryDir, model: value }) {
  const model = checkedModel(value);
  const folder = path.join(libraryDir, 'models');
  const file = path.join(folder, `${model.sha256}.onnx`);
  const directory = await fs.lstat(folder).catch(() => null);

  if (directory && !directory.isDirectory()) throw new Error('The model cache must be a local folder.');

  const kept = directory?.isDirectory() ? await cached(file, model) : null;

  if (kept) return new Uint8Array(kept);

  const bytes = await client.download(`/${model.owner}/${model.repo}/resolve/${model.revision}/${model.file}`, {
    maxBytes: model.bytes,
    label: 'model.onnx',
  });

  if (!matches(bytes, model)) throw new Error('The model bytes do not match the manifest.');

  await fs.mkdir(folder, { recursive: true });

  if (!(await fs.lstat(folder)).isDirectory()) throw new Error('The model cache must be a local folder.');

  const temporary = path.join(folder, `${model.sha256}-${crypto.randomUUID()}.tmp`);

  try {
    await fs.writeFile(temporary, bytes, { flag: 'wx' });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }

  return new Uint8Array(bytes);
}
