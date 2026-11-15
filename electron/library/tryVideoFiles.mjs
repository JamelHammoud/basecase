import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeAtomic } from './atomicFile.mjs';

const MAX_VIDEO = 2 * 1024 * 1024 * 1024;
const MAX_MANIFEST = 256 * 1024;
const MAX_CAMERAS = 32;
const validCamera = (value) => typeof value === 'string' && value.length > 0 && value.length <= 256;

function manifestAt(dir, id) {
  const file = path.join(dir, 'try.json');
  const stat = fs.lstatSync(file);

  if (!stat.isFile() || stat.size > MAX_MANIFEST || !fs.lstatSync(dir).isDirectory()) return null;

  if (!fs.lstatSync(path.dirname(dir)).isDirectory()) return null;

  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));

  return manifest?.id === id ? manifest : null;
}

export function videoLocation(dir, { id, camera = 'operator' }) {
  if (!validCamera(camera)) return null;

  try {
    const manifest = manifestAt(dir, id);
    const videos = manifest?.videos;

    if (!Array.isArray(videos) || videos.length > MAX_CAMERAS) return null;

    const matching = videos.filter((video) => video?.camera === camera);

    if (matching.length !== 1) return null;

    const operator = manifest.source === 'operate' && camera === 'operator' && matching[0].path === 'operator.mp4';
    const filename = operator ? 'operator.mp4' : `camera-${createHash('sha256').update(camera).digest('hex')}.mp4`;

    return path.join(dir, filename);
  } catch {
    return null;
  }
}

export function keepVideo(dir, payload) {
  const file = videoLocation(dir, payload);

  if (!file) return { ok: false };

  if (!(payload.bytes instanceof Uint8Array)) throw new Error('Expected bytes');

  if (payload.bytes.byteLength > MAX_VIDEO) throw new Error('Too large to keep');

  writeAtomic(file, payload.bytes);
  fs.rmSync(`${file}.ref`, { force: true });

  return { ok: true };
}

function videoAsset(dir, file) {
  const reference = `${file}.ref`;

  if (!fs.existsSync(reference)) return file;

  const stat = fs.lstatSync(reference);

  if (!stat.isFile() || stat.size !== 64) return null;

  const hash = fs.readFileSync(reference, 'utf8');
  const assets = path.join(path.dirname(dir), '.videos');

  if (!/^[a-f0-9]{64}$/.test(hash) || !fs.lstatSync(assets).isDirectory()) return null;

  return path.join(assets, `${hash}.mp4`);
}

export function storedVideo(dir, payload) {
  const location = videoLocation(dir, payload);

  if (!location) return null;

  try {
    const file = videoAsset(dir, location);

    if (!file) return null;

    const stat = fs.lstatSync(file);

    return stat.isFile() && stat.size > 0 && stat.size <= MAX_VIDEO ? { file, size: stat.size } : null;
  } catch {
    return null;
  }
}

export function videoIdentity(file) {
  if (!file) return null;

  try {
    const dir = path.dirname(file);
    const folder = fs.lstatSync(dir);
    const manifest = fs.lstatSync(path.join(dir, 'try.json'));

    if (!folder.isDirectory() || !manifest.isFile()) return null;

    return [folder.dev, folder.ino, folder.birthtimeMs, manifest.dev, manifest.ino, manifest.ctimeMs].join(':');
  } catch {
    return null;
  }
}
