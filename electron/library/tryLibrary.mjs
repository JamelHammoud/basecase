import fs from 'node:fs';
import path from 'node:path';
import { checkedFileId, isSafeFileId } from '../backend/constants.mjs';

const MANIFEST = 'try.json';
const RECORDING = 'recording.bin';
const FILM = 'film.webp';
const VIDEOS = 'videos';

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const isBytes = (value) => value instanceof Uint8Array;

const newest = (a, b) => String(b.at ?? '').localeCompare(String(a.at ?? ''));

export function summarize(record) {
  if (!isPlainObject(record.robot)) return record;

  const robot = { ...record.robot };

  delete robot.joints;

  return { ...record, robot };
}

function checkedRecord(record) {
  if (!isPlainObject(record) || typeof record.version !== 'number') throw new Error('A try needs a versioned record');

  checkedFileId(record.id);

  return record;
}

function checkedBytes(bytes, what) {
  if (!isBytes(bytes)) throw new Error(`${what} must be bytes`);

  return bytes;
}

function checkedVideos(videos) {
  if (videos == null) return [];

  if (!isPlainObject(videos)) throw new Error('Videos must map cameras to bytes');

  return Object.entries(videos).map(([camera, bytes]) => [checkedFileId(camera), checkedBytes(bytes, 'A video')]);
}

const readOrNull = (file) => {
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
};

export class TryLibrary {
  constructor({ triesDir, cacheFile }) {
    this.triesDir = triesDir;
    this.cacheFile = cacheFile;
    this.cache = this.readCache();
    this.dirty = false;
    fs.mkdirSync(triesDir, { recursive: true });
  }

  readCache() {
    try {
      return new Map(Object.entries(JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'))));
    } catch {
      return new Map();
    }
  }

  writeCache() {
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(Object.fromEntries(this.cache)), 'utf-8');
      this.dirty = false;
    } catch {}
  }

  folder(id) {
    return path.join(this.triesDir, checkedFileId(id));
  }

  folders() {
    try {
      return fs
        .readdirSync(this.triesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && isSafeFileId(entry.name))
        .map((entry) => entry.name);
    } catch {
      return [];
    }
  }

  summaryOf(name) {
    const manifest = path.join(this.triesDir, name, MANIFEST);
    const stat = fs.statSync(manifest);
    const cached = this.cache.get(name);

    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return { summary: cached.summary, fresh: false };
    }

    const record = JSON.parse(fs.readFileSync(manifest, 'utf-8'));

    if (!isPlainObject(record) || record.id !== name) throw new Error(`Not a try: ${name}`);

    const summary = summarize(record);

    this.cache.set(name, { mtimeMs: stat.mtimeMs, size: stat.size, summary });

    return { summary, fresh: true };
  }

  list() {
    const names = this.folders();
    const present = new Set(names);
    const summaries = [];
    let changed = this.dirty;

    for (const name of names) {
      try {
        const { summary, fresh } = this.summaryOf(name);

        summaries.push(summary);
        changed ||= fresh;
      } catch {
        changed ||= this.cache.delete(name);
      }
    }

    for (const name of this.cache.keys()) {
      if (present.has(name)) continue;

      this.cache.delete(name);
      changed = true;
    }

    if (changed) this.writeCache();

    return summaries.sort(newest);
  }

  save({ record, recording, videos } = {}) {
    const checked = checkedRecord(record);
    const cameras = checkedVideos(videos);
    const bytes = recording == null ? null : checkedBytes(recording, 'A recording');
    const dir = this.folder(checked.id);
    const manifest = path.join(dir, MANIFEST);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify(checked), 'utf-8');

    if (bytes) fs.writeFileSync(path.join(dir, RECORDING), bytes);

    this.writeVideos(dir, cameras);

    const stat = fs.statSync(manifest);
    const summary = summarize(checked);

    this.cache.set(checked.id, { mtimeMs: stat.mtimeMs, size: stat.size, summary });
    this.dirty = true;

    return summary;
  }

  writeVideos(dir, cameras) {
    if (!cameras.length) return;

    fs.mkdirSync(path.join(dir, VIDEOS), { recursive: true });

    for (const [camera, bytes] of cameras) fs.writeFileSync(path.join(dir, VIDEOS, `${camera}.webm`), bytes);
  }

  open(id) {
    if (!isSafeFileId(id)) return null;

    const dir = this.folder(id);

    try {
      const record = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf-8'));

      return { record, recording: readOrNull(path.join(dir, RECORDING)) };
    } catch {
      return null;
    }
  }

  film(id) {
    if (!isSafeFileId(id)) return null;

    return readOrNull(path.join(this.folder(id), FILM));
  }

  saveFilm({ id, film } = {}) {
    const dir = this.folder(id);
    const bytes = checkedBytes(film, 'A film');

    if (!fs.existsSync(path.join(dir, MANIFEST))) throw new Error(`No try ${id}`);

    fs.writeFileSync(path.join(dir, FILM), bytes);

    return { ok: true };
  }

  delete(ids) {
    const asked = new Set((Array.isArray(ids) ? ids : []).filter(isSafeFileId));

    if (!asked.size) return { deleted: [] };

    const generated = this.list().filter((t) => t.source === 'generated' && asked.has(t.sourceTry ?? ''));
    const gone = [...new Set([...asked, ...generated.map((t) => t.id)])].filter(isSafeFileId);
    const deleted = gone.filter((id) => this.remove(id));

    if (deleted.length) this.writeCache();

    return { deleted };
  }

  remove(id) {
    const dir = this.folder(id);

    if (!fs.existsSync(dir)) return false;

    fs.rmSync(dir, { recursive: true, force: true });
    this.cache.delete(id);

    return true;
  }
}
