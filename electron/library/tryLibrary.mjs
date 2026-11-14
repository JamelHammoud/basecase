import fs from 'node:fs';
import path from 'node:path';
import { checkedFileId, isSafeFileId } from '../backend/constants.mjs';

export const MAX_MANIFEST_BYTES = 256 * 1024;

const MANIFEST = 'try.json';
const RECORDING = 'recording.bin';
const FILM = 'film.webp';

const newest = (a, b) => String(b.at ?? '').localeCompare(String(a.at ?? ''));

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;

  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
};

const isBytes = (value) => value === undefined || value === null || value instanceof Uint8Array;

function manifestJson(manifest) {
  if (!isPlainObject(manifest)) throw new Error('A try needs a manifest');

  checkedFileId(manifest.id);

  const json = JSON.stringify(manifest);

  if (Buffer.byteLength(json) > MAX_MANIFEST_BYTES) throw new Error('This try’s manifest is too large');

  return json;
}

function writeAtomic(file, data) {
  const temp = `${file}.tmp`;

  fs.writeFileSync(temp, data);
  fs.renameSync(temp, file);
}

function readOptional(file) {
  try {
    return fs.readFileSync(file);
  } catch (err) {
    if (err?.code === 'ENOENT') return null;

    throw err;
  }
}

function readManifest(file, id) {
  try {
    const text = fs.readFileSync(file, 'utf-8');
    const manifest = JSON.parse(text);

    return isPlainObject(manifest) && manifest.id === id ? { manifest, text } : null;
  } catch {
    return null;
  }
}

function tryFolders(triesDir) {
  try {
    return fs
      .readdirSync(triesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isSafeFileId(entry.name))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export class TryLibrary {
  constructor({ triesDir, cacheFile }) {
    this.triesDir = triesDir;
    this.cacheFile = cacheFile;
    this.summaries = null;
    this.texts = new Map();
    this.dirty = false;
  }

  get cache() {
    this.summaries ??= this.readCache();

    return this.summaries;
  }

  readCache() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));

      return new Map(Object.entries(isPlainObject(parsed) ? parsed : {}).filter(([, m]) => isPlainObject(m)));
    } catch {
      return new Map();
    }
  }

  textOf(id, manifest) {
    if (!this.texts.has(id)) this.texts.set(id, JSON.stringify(manifest));

    return this.texts.get(id);
  }

  remember(id, { manifest, text }) {
    this.cache.set(id, manifest);
    this.texts.set(id, text);
  }

  forget(id) {
    this.cache.delete(id);
    this.texts.delete(id);
  }

  writeCache() {
    const entries = [...this.cache].map(([id, manifest]) => `${JSON.stringify(id)}:${this.textOf(id, manifest)}`);

    try {
      writeAtomic(this.cacheFile, `{${entries.join(',')}}`);
    } catch {}
  }

  folder(id) {
    return path.join(this.triesDir, checkedFileId(id));
  }

  list() {
    const ids = tryFolders(this.triesDir);
    const present = new Set(ids);
    const { cache } = this;
    let changed = this.dirty;

    for (const id of ids) {
      if (cache.has(id)) continue;

      const stored = readManifest(path.join(this.triesDir, id, MANIFEST), id);

      if (!stored) continue;

      this.remember(id, stored);
      changed = true;
    }

    for (const id of [...cache.keys()]) {
      if (present.has(id)) continue;

      this.forget(id);
      changed = true;
    }

    if (changed) this.writeCache();

    this.dirty = false;

    return [...cache.values()].sort(newest);
  }

  save(payload) {
    const { manifest, recording, film } = payload ?? {};
    const json = manifestJson(manifest);

    if (!isBytes(recording) || !isBytes(film)) throw new Error('A try’s recording and film must be bytes');

    const dir = this.folder(manifest.id);

    fs.mkdirSync(dir, { recursive: true });

    if (recording) fs.writeFileSync(path.join(dir, RECORDING), recording);

    if (film) fs.writeFileSync(path.join(dir, FILM), film);

    writeAtomic(path.join(dir, MANIFEST), json);
    this.remember(manifest.id, { manifest: JSON.parse(json), text: json });
    this.dirty = true;

    return { ok: true };
  }

  recording(id) {
    return readOptional(path.join(this.folder(id), RECORDING));
  }

  film(id) {
    return readOptional(path.join(this.folder(id), FILM));
  }

  delete(ids) {
    if (!Array.isArray(ids)) throw new Error('Pick the tries to delete');

    const folders = ids.map((id) => this.folder(id));

    for (const dir of folders) fs.rmSync(dir, { recursive: true, force: true });

    for (const id of ids) this.forget(id);

    this.dirty = true;

    return { deleted: [...ids] };
  }
}
