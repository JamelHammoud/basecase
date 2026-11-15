import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { isSafeFileId } from '../backend/constants.mjs';

export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

const HASH = /^[a-f0-9]{64}$/;
const mutations = new Map();

const existsRegular = async (file) => {
  const stat = await fsp.lstat(file).catch(() => null);

  return stat?.isFile() && stat.size > 0 && stat.size <= MAX_VIDEO_BYTES;
};

function serialized(root, work) {
  const previous = mutations.get(root) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);

  mutations.set(root, next);

  return next.finally(() => {
    if (mutations.get(root) === next) mutations.delete(root);
  });
}

async function assetFolder(root) {
  const dir = path.join(root, '.videos');

  await fsp.mkdir(dir, { recursive: true });

  return (await fsp.lstat(dir)).isDirectory() ? dir : null;
}

async function receiveAsset(request, file, hash) {
  const declared = request.headers.get('x-video-bytes');
  const size = declared && /^\d+$/.test(declared) ? Number(declared) : NaN;

  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_VIDEO_BYTES || !request.body) return 413;

  const temp = `${file}.${randomUUID()}.tmp`;
  const digest = createHash('sha256');
  let received = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, done) {
      received += chunk.byteLength;

      if (received > size || received > MAX_VIDEO_BYTES) return done(new Error('Video too large'));

      digest.update(chunk);
      done(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(request.body), limiter, fs.createWriteStream(temp, { flags: 'wx' }));

    if (received !== size || digest.digest('hex') !== hash) return 400;

    const stat = await fsp.lstat(file).catch(() => null);

    if (stat && !stat.isFile()) return 404;

    if (!stat) await fsp.rename(temp, file);

    return 200;
  } catch {
    return received > size || received > MAX_VIDEO_BYTES ? 413 : 400;
  } finally {
    await fsp.rm(temp, { force: true }).catch(() => {});
  }
}

async function bindAsset(hash, target) {
  const reference = `${target}.ref`;
  const temp = `${reference}.${randomUUID()}.tmp`;

  try {
    await fsp.writeFile(temp, hash, { flag: 'wx' });
    await fsp.rename(temp, reference);
    await fsp.rm(target, { force: true });

    return 200;
  } catch {
    return 400;
  } finally {
    await fsp.rm(temp, { force: true }).catch(() => {});
  }
}

export function writeTryVideo(request, store, payload) {
  const { hash } = payload;

  if (!HASH.test(hash ?? '') || !store.videoTarget(payload)) return Promise.resolve(404);

  return serialized(store.triesDir, async () => {
    const target = store.videoTarget(payload);

    if (!target) return 404;

    const dir = await assetFolder(store.triesDir);

    if (!dir) return 404;

    const asset = path.join(dir, `${hash}.mp4`);

    const status = request.method === 'PUT' ? await receiveAsset(request, asset, hash) : 200;

    if (status !== 200) return status;

    if (!(await existsRegular(asset)) || store.videoTarget(payload) !== target) return 404;

    return bindAsset(hash, target);
  });
}

async function videoReferences(root) {
  const references = new Set();
  const tries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);

  for (const entry of tries) {
    if (!entry.isDirectory() || !isSafeFileId(entry.name)) continue;

    const dir = path.join(root, entry.name);
    const files = await fsp.readdir(dir).catch(() => []);

    for (const name of files) {
      if (!/^(operator|camera-[a-f0-9]{64})\.mp4\.ref$/.test(name)) continue;

      const file = path.join(dir, name);
      const stat = await fsp.lstat(file).catch(() => null);

      if (!stat?.isFile() || stat.size !== 64) continue;

      const hash = await fsp.readFile(file, 'utf8').catch(() => '');

      if (HASH.test(hash)) references.add(hash);
    }
  }

  return references;
}

export function cleanVideoAssets(root) {
  return serialized(root, async () => {
    const dir = path.join(root, '.videos');
    const stat = await fsp.lstat(dir).catch(() => null);

    if (!stat?.isDirectory()) return;

    const references = await videoReferences(root);
    const entries = await fsp.readdir(dir).catch(() => []);

    for (const name of entries) {
      if (!/^[a-f0-9]{64}\.mp4$/.test(name) || references.has(name.slice(0, -4))) continue;

      const file = path.join(dir, name);
      const stat = await fsp.lstat(file).catch(() => null);

      if (stat?.isFile()) await fsp.unlink(file).catch(() => {});
    }
  });
}
