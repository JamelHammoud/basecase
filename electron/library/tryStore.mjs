import fs from 'node:fs';
import path from 'node:path';
import { checkedFileId, isSafeFileId } from '../backend/constants.mjs';

export const TRY_MANIFEST = 'try.json';
export const TRY_RECORDING = 'recording.bin';
export const TRY_STRIP = 'strip.webp';

const MAX_MANIFEST = 256 * 1024;
const MAX_RECORDING = 1024 * 1024 * 1024;
const MAX_STRIP = 2 * 1024 * 1024;
const MAX_INDEX = 512 * 1024 * 1024;
const MAX_MANIFEST_BATCH = 500;
const SOURCES = new Set(['case', 'generated', 'real']);
const VERDICTS = new Set(['passed', 'failed', 'unjudged']);

const text = (value, fallback = '') => (typeof value === 'string' ? value.slice(0, 512) : fallback);
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const idOrNull = (value) => (isSafeFileId(value) ? value : null);
const isPlain = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function outcomeOf(value) {
  const outcome = isPlain(value) ? value : {};

  return {
    verdict: VERDICTS.has(outcome.verdict) ? outcome.verdict : 'unjudged',
    margin: typeof outcome.margin === 'number' && Number.isFinite(outcome.margin) ? outcome.margin : null,
  };
}

export function summarizeTry(manifest, { recording, strip, stamp }) {
  const robot = isPlain(manifest.robot) ? manifest.robot : {};
  const kase = isPlain(manifest.case) ? manifest.case : null;

  return {
    id: manifest.id,
    sceneId: text(manifest.sceneId),
    robot: text(robot.name),
    modelHash: text(robot.modelHash),
    caseId: kase ? text(kase.id) : null,
    caseName: kase ? text(kase.name) : null,
    source: SOURCES.has(manifest.source) ? manifest.source : 'case',
    input: typeof manifest.input === 'string' ? text(manifest.input) : null,
    startedAt: text(manifest.startedAt),
    seconds: number(manifest.seconds),
    frames: number(manifest.frames),
    outcome: outcomeOf(manifest.outcome),
    seed: number(manifest.seed),
    sourceTry: idOrNull(manifest.sourceTry),
    recording,
    strip,
    ...(typeof stamp === 'number' ? { stamp } : {}),
  };
}

function checkedManifest(manifest) {
  if (!isPlain(manifest)) throw new Error('A try needs its manifest');

  checkedFileId(manifest.id);
  checkedFileId(manifest.sceneId);

  const json = JSON.stringify(manifest);

  if (json.length > MAX_MANIFEST) throw new Error('A try’s manifest is too large');

  return json;
}

function checkedBytes(bytes, max) {
  if (!(bytes instanceof Uint8Array)) throw new Error('Expected bytes');

  if (bytes.byteLength > max) throw new Error('Too large to keep');

  return bytes;
}

function writeAtomic(file, data) {
  const temp = `${file}.${process.pid}.tmp`;

  fs.writeFileSync(temp, data);
  fs.renameSync(temp, file);
}

const readOrNull = (file) => {
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
};

export class TryStore {
  constructor({ triesDir, cacheFile, indexFile }) {
    this.triesDir = triesDir;
    this.cacheFile = cacheFile;
    this.indexFile = indexFile ?? path.join(path.dirname(cacheFile), '.try-index.bin');
    this.cache = null;
  }

  readCache() {
    try {
      return new Map(Object.entries(JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'))));
    } catch {
      return new Map();
    }
  }

  get summaries() {
    this.cache ??= this.readCache();

    return this.cache;
  }

  writeCache() {
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(Object.fromEntries(this.summaries)), 'utf-8');
    } catch {}
  }

  dirOf(id) {
    return path.join(this.triesDir, checkedFileId(id));
  }

  summaryOf(id) {
    const dir = path.join(this.triesDir, id);
    const stat = fs.statSync(path.join(dir, TRY_MANIFEST));
    const cached = this.summaries.get(id);

    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return this.withStrip(id, cached);

    const manifest = JSON.parse(fs.readFileSync(path.join(dir, TRY_MANIFEST), 'utf-8'));

    if (manifest?.id !== id) return { summary: null };

    const summary = summarizeTry(manifest, {
      recording: fs.existsSync(path.join(dir, TRY_RECORDING)),
      strip: fs.existsSync(path.join(dir, TRY_STRIP)),
      stamp: stat.mtimeMs,
    });

    this.summaries.set(id, { mtimeMs: stat.mtimeMs, size: stat.size, summary });

    return { summary, fresh: true };
  }

  withStrip(id, cached) {
    const strip = cached.summary.strip || fs.existsSync(path.join(this.triesDir, id, TRY_STRIP));

    if (strip === cached.summary.strip && cached.summary.stamp === cached.mtimeMs) return { summary: cached.summary };

    cached.summary = { ...cached.summary, strip, stamp: cached.mtimeMs };

    return { summary: cached.summary, fresh: true };
  }

  storedIds() {
    try {
      return fs
        .readdirSync(this.triesDir, { withFileTypes: true })
        .flatMap((entry) => (entry.isDirectory() && isSafeFileId(entry.name) ? [entry.name] : []));
    } catch {
      return [];
    }
  }

  list() {
    const ids = this.storedIds();
    const summaries = [];
    let changed = false;

    for (const id of ids) {
      try {
        const { summary, fresh } = this.summaryOf(id);

        if (summary) summaries.push(summary);

        changed ||= !!fresh;
      } catch {}
    }

    const present = new Set(ids);

    for (const id of [...this.summaries.keys()]) {
      if (present.has(id)) continue;

      this.summaries.delete(id);
      changed = true;
    }

    if (changed) this.writeCache();

    return summaries;
  }

  forget(id) {
    this.summaries.delete(id);
  }

  save({ manifest, recording }) {
    const json = checkedManifest(manifest);
    const bytes = recording === undefined || recording === null ? null : checkedBytes(recording, MAX_RECORDING);
    const dir = this.dirOf(manifest.id);

    fs.mkdirSync(dir, { recursive: true });

    if (bytes) writeAtomic(path.join(dir, TRY_RECORDING), bytes);

    writeAtomic(path.join(dir, TRY_MANIFEST), json);
    this.forget(manifest.id);

    return { ok: true };
  }

  recording(id) {
    return readOrNull(path.join(this.dirOf(id), TRY_RECORDING));
  }

  strip(id) {
    return readOrNull(path.join(this.dirOf(id), TRY_STRIP));
  }

  saveStrip({ id, bytes }) {
    const dir = this.dirOf(id);

    if (!fs.existsSync(path.join(dir, TRY_MANIFEST))) return { ok: false };

    writeAtomic(path.join(dir, TRY_STRIP), checkedBytes(bytes, MAX_STRIP));

    return { ok: true };
  }

  manifests(ids) {
    if (!Array.isArray(ids)) throw new Error('Expected a list of tries');

    if (ids.length > MAX_MANIFEST_BATCH) throw new Error('Too many tries at once');

    return ids.flatMap((id) => {
      const file = path.join(this.dirOf(id), TRY_MANIFEST);

      try {
        const manifest = JSON.parse(fs.readFileSync(file, 'utf-8'));

        return isPlain(manifest) && manifest.id === id ? [manifest] : [];
      } catch {
        return [];
      }
    });
  }

  index() {
    return readOrNull(this.indexFile);
  }

  saveIndex(bytes) {
    fs.mkdirSync(path.dirname(this.indexFile), { recursive: true });
    writeAtomic(this.indexFile, checkedBytes(bytes, MAX_INDEX));

    return { ok: true };
  }

  delete(ids) {
    if (!Array.isArray(ids)) throw new Error('Expected a list of tries');

    const dirs = ids.map((id) => this.dirOf(id));

    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });

    for (const id of ids) this.forget(id);

    return { deleted: ids };
  }
}
