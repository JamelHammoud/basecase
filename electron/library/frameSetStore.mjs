import fs from 'node:fs';
import path from 'node:path';
import { checkedFileId, isSafeFileId } from '../backend/constants.mjs';
import { writeAtomic } from './atomicFile.mjs';

export const MAX_FRAME_MANIFEST_BYTES = 16 * 1024 * 1024;
export const MAX_FRAME_BLOB_BYTES = 64 * 1024 * 1024;

const MAX_FRAMES = 10_000;
const MAX_PIXELS = MAX_FRAME_BLOB_BYTES / 4;
const plain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const dimension = (v) => Number.isInteger(v) && v > 0 && v <= 8192;

const badFrame = (frame) => !dimension(frame.width) || !dimension(frame.height) || frame.width * frame.height > MAX_PIXELS || frame.jpeg !== undefined || frame.depth !== undefined;

function checkedManifest(value) {
  if (!plain(value)) throw new Error('A frame set needs its manifest');

  checkedFileId(value.id);

  for (const id of [value.caseId, value.sceneId]) if (id !== null) checkedFileId(id);

  const json = JSON.stringify(value);

  if (Buffer.byteLength(json) > MAX_FRAME_MANIFEST_BYTES) throw new Error('The image manifest is too large');

  if (value.version !== 1 || !Array.isArray(value.frames) || value.frames.length > MAX_FRAMES) throw new Error('Check the image manifest');

  const ids = new Set();

  for (const frame of value.frames) {
    checkedFileId(frame?.id);

    if (ids.has(frame.id) || badFrame(frame)) throw new Error('Check the image frame');

    ids.add(frame.id);
  }

  return json;
}

function checkedBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_FRAME_BLOB_BYTES) throw new Error('The image frame is too large');

  return bytes;
}

const readBytes = (file) => {
  if (fs.statSync(file).size > MAX_FRAME_BLOB_BYTES) throw new Error('The image frame is too large');

  return new Uint8Array(fs.readFileSync(file));
};

export class FrameSetStore {
  constructor({ dir }) {
    this.dir = dir;
    this.cached = null;
  }

  folder(id) {
    return path.join(this.dir, checkedFileId(id));
  }

  frameFiles({ id, frameId }) {
    const folder = this.folder(id);
    const safe = checkedFileId(frameId);

    return { jpeg: path.join(folder, `${safe}.jpg`), depth: path.join(folder, `${safe}.depth`) };
  }

  saveFrame(payload) {
    const files = this.frameFiles(payload ?? {});
    const jpeg = checkedBytes(payload.jpeg);
    const depth = checkedBytes(payload.depth);

    fs.mkdirSync(this.folder(payload.id), { recursive: true });
    writeAtomic(files.jpeg, jpeg);
    writeAtomic(files.depth, depth);

    return { ok: true };
  }

  saveManifest(value) {
    const json = checkedManifest(value);

    for (const frame of value.frames) {
      const files = this.frameFiles({ id: value.id, frameId: frame.id });

      if (fs.statSync(files.jpeg).size > MAX_FRAME_BLOB_BYTES || fs.statSync(files.depth).size !== frame.width * frame.height * 4) throw new Error('The image frame does not match its manifest');
    }

    fs.mkdirSync(this.folder(value.id), { recursive: true });
    writeAtomic(path.join(this.folder(value.id), 'manifest.json'), json);
    this.cached = null;

    return { ok: true };
  }

  finalize({ manifest, sourceId }) {
    checkedManifest(manifest);

    const source = this.folder(sourceId ?? manifest.id);
    const destination = this.folder(manifest.id);

    if (source === destination) return this.saveManifest(manifest);

    const pairs = manifest.frames.map((frame) => ({
      from: this.frameFiles({ id: sourceId, frameId: frame.id }),
      to: this.frameFiles({ id: manifest.id, frameId: frame.id }),
    }));

    fs.mkdirSync(destination, { recursive: true });

    for (const { from, to } of pairs) {
      writeAtomic(to.jpeg, readBytes(from.jpeg));
      writeAtomic(to.depth, readBytes(from.depth));
    }

    const saved = this.saveManifest(manifest);

    fs.rmSync(source, { recursive: true, force: true });

    return saved;
  }

  manifest(id) {
    const file = path.join(this.folder(id), 'manifest.json');

    try {
      const { size, mtimeMs, ctimeMs } = fs.statSync(file);

      if (size > MAX_FRAME_MANIFEST_BYTES) return null;

      if (this.cached?.id === id && this.cached.size === size && this.cached.mtimeMs === mtimeMs && this.cached.ctimeMs === ctimeMs) return this.cached.value;

      const value = JSON.parse(fs.readFileSync(file, 'utf8'));

      checkedManifest(value);

      if (value.id !== id) return null;

      this.cached = { id, size, mtimeMs, ctimeMs, value };

      return value;
    } catch {
      return null;
    }
  }

  list() {
    try {
      return fs.readdirSync(this.dir, { withFileTypes: true }).flatMap((entry) => {
        const manifest = entry.isDirectory() && isSafeFileId(entry.name) ? this.manifest(entry.name) : null;

        return manifest ? [{ ...manifest, frames: manifest.frames.length }] : [];
      });
    } catch {
      return [];
    }
  }

  frame(payload) {
    const files = this.frameFiles(payload ?? {});
    const manifest = this.manifest(payload.id);

    if (!manifest?.frames.some((frame) => frame.id === payload.frameId)) return null;

    try {
      return { jpeg: readBytes(files.jpeg), depth: readBytes(files.depth) };
    } catch {
      return null;
    }
  }

  jpeg(payload) {
    const files = this.frameFiles(payload ?? {});
    const manifest = this.manifest(payload.id);

    if (!manifest?.frames.some((frame) => frame.id === payload.frameId)) return null;

    try {
      return readBytes(files.jpeg);
    } catch {
      return null;
    }
  }
}
