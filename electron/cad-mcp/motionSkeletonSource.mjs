import fs from 'node:fs';
import path from 'node:path';
import { publicFetch, readCapped } from '../publicFetch.mjs';
import { EVIDENCE_DIR } from './shared.mjs';

export const MAX_MOTION_BYTES = 8 * 1024 * 1024;

async function attachedMotion(file, folder) {
  if (!folder) throw new Error('Attach a BVH motion file first.');

  const root = await fs.promises.realpath(folder);
  const full = await fs.promises.realpath(path.resolve(root, file));

  if (!full.startsWith(root + path.sep)) throw new Error('Choose a BVH from the attached files.');

  const stat = await fs.promises.stat(full);

  if (!stat.isFile()) throw new Error('Choose a BVH file.');

  const body = fs.createReadStream(full);

  try {
    return await readCapped(
      { headers: new Headers({ 'content-length': String(stat.size) }), body },
      MAX_MOTION_BYTES,
      'The BVH file',
    );
  } finally {
    body.destroy();
  }
}

export async function motionSkeletonSource({ file, url }, { folder = EVIDENCE_DIR, fetch = publicFetch } = {}) {
  if (file) return (await attachedMotion(file, folder)).toString('utf-8');

  if (!url) throw new Error('Give file (an attached .bvh) or url.');

  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });

  if (!res.ok) throw new Error(`The BVH download returned HTTP ${res.status}.`);

  return (await readCapped(res, MAX_MOTION_BYTES, 'The BVH file')).toString('utf-8');
}
