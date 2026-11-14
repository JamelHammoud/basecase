import fs from 'node:fs';
import path from 'node:path';
import { checkedFileId } from '../backend/constants.mjs';

export const STAGING_DIR = '.recording';
export const MAX_VIDEO = 512 * 1024 * 1024;
export const MAX_VIDEO_CHUNK = 4 * 1024 * 1024;
export const MAX_OPEN_VIDEOS = 8;

const writeAt = ({ fd, bytes, position }) =>
  new Promise((resolve, reject) => {
    fs.write(fd, bytes, 0, bytes.byteLength, position, (err) => (err ? reject(err) : resolve()));
  });

function checkedChunk({ position, bytes }) {
  if (!(bytes instanceof Uint8Array)) throw new Error('Expected bytes');

  if (!Number.isSafeInteger(position) || position < 0) throw new Error('Expected a position');

  if (bytes.byteLength > MAX_VIDEO_CHUNK || position + bytes.byteLength > MAX_VIDEO) {
    throw new Error('Too large to keep');
  }
}

export class TryVideos {
  constructor({ triesDir, keptPathOf }) {
    this.dir = path.join(triesDir, STAGING_DIR);
    this.keptPathOf = keptPathOf;
    this.open = new Map();
  }

  fileOf(id) {
    return path.join(this.dir, `${checkedFileId(id)}.mp4`);
  }

  opened(id) {
    const file = this.fileOf(id);
    const live = this.open.get(id);

    if (live) return live;

    if (this.open.size >= MAX_OPEN_VIDEOS) return null;

    fs.mkdirSync(this.dir, { recursive: true });

    const entry = { fd: fs.openSync(file, 'w'), writes: Promise.resolve() };

    this.open.set(id, entry);

    return entry;
  }

  async write({ id, position, bytes }) {
    this.fileOf(id);
    checkedChunk({ position, bytes });

    const entry = this.opened(id);

    if (!entry) return { ok: false };

    const written = entry.writes.then(() => writeAt({ fd: entry.fd, bytes, position }));

    entry.writes = written.catch(() => undefined);
    await written;

    return { ok: true };
  }

  async close({ id, keep }) {
    const file = this.fileOf(id);
    const entry = this.open.get(id);

    if (!entry) return { ok: false };

    this.open.delete(id);
    await entry.writes;
    fs.closeSync(entry.fd);

    const kept = keep === true ? this.keptPathOf(id) : null;

    if (kept) await fs.promises.rename(file, kept);
    else await fs.promises.rm(file, { force: true });

    return { ok: !!kept };
  }

  sweep() {
    for (const entry of this.open.values()) fs.closeSync(entry.fd);

    this.open.clear();
    fs.rmSync(this.dir, { recursive: true, force: true });
  }
}
