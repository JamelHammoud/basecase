import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';

export const hashOf = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function checkedHash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Expected a SHA-256 hash');

  return value;
}

export async function directory(dir, create = true) {
  try {
    if (create) await fs.mkdir(dir);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  const stat = await fs.lstat(dir);

  if (!stat.isDirectory()) throw new Error('Training needs a regular directory');

  return dir;
}

export async function readFile(file, cap) {
  const stat = await fs.lstat(file);

  if (!stat.isFile()) throw new Error('Training needs a regular file');

  if (stat.size > cap) throw new Error('The training file is too large');

  const handle = await fs.open(file, 'r');

  try {
    const opened = await handle.stat();

    if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size > cap) {
      throw new Error('The training file changed');
    }

    const bytes = Buffer.alloc(opened.size);
    let offset = 0;

    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, Math.min(1024 * 1024, bytes.length - offset), offset);

      if (!bytesRead) throw new Error('The training file changed');

      offset += bytesRead;
    }

    return bytes;
  } finally {
    await handle.close();
  }
}

export async function immutableFile(file, bytes) {
  const temporary = `${file}.${randomUUID()}.tmp`;

  await fs.writeFile(temporary, bytes, { flag: 'wx' });

  try {
    await fs.link(temporary, file);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;

    const saved = await readFile(file, Math.max(bytes.length, 16 * 1024 * 1024));

    if (!saved.equals(Buffer.from(bytes)))
      throw new Error('Training records are immutable and must match', { cause: error });
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function contentFile(libraryDir, hash, cap) {
  const datasets = await directory(path.join(libraryDir, 'datasets'), false);
  const content = await directory(path.join(datasets, 'content'), false);
  const bytes = await readFile(path.join(content, checkedHash(hash)), cap);

  if ((await contentHash(bytes)) !== hash) throw new Error('Training image does not match its hash');

  return bytes;
}

export async function saveContent(libraryDir, bytes) {
  const datasets = await directory(path.join(libraryDir, 'datasets'));
  const dir = await directory(path.join(datasets, 'content'));
  const sha256 = await contentHash(bytes);

  await immutableFile(path.join(dir, sha256), bytes);

  return { sha256, bytes: bytes.length };
}

async function contentHash(bytes) {
  const hash = createHash('sha256');

  for (let offset = 0; offset < bytes.length; offset += 1024 * 1024) {
    hash.update(bytes.subarray(offset, offset + 1024 * 1024));
    await setImmediate();
  }

  return hash.digest('hex');
}

export async function writeJob(dir, job) {
  const temporary = path.join(dir, `${randomUUID()}.tmp`);

  await fs.writeFile(temporary, JSON.stringify(job), { flag: 'wx' });

  try {
    await fs.rename(temporary, path.join(dir, 'job.json'));
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
