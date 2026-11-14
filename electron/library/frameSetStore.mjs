import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { checkedHash, checkedManifest, MAX_FRAME_BYTES, MAX_MANIFEST_BYTES, summaryOf, isHash } from './frameSetPolicy.mjs';

export { MAX_FRAME_BYTES, MAX_MANIFEST_BYTES } from './frameSetPolicy.mjs';

const checkFrame = (payload) => new Promise((resolve, reject) => {
  const worker = new Worker(new URL('./frameSetCheck.worker.mjs', import.meta.url), { workerData: payload });

  worker.once('message', (reply) => reply.error ? reject(new Error(reply.error)) : resolve());
  worker.once('error', reject);
  worker.once('exit', (code) => { if (code !== 0) reject(new Error('The frame check stopped.')); });
});

async function atomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });

  const temporary = `${file}.${randomUUID()}.tmp`;

  try {
    await fs.writeFile(temporary, data);
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function cappedRead(file, cap) {
  const handle = await fs.open(file, 'r');

  try {
    if ((await handle.stat()).size > cap) throw new Error('The frame file is too large.');

    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

export class FrameSetStore {
  constructor({ dir }) {
    this.dir = dir;
  }
  file(kind, id) {
    return path.join(this.dir, kind, `${checkedHash(id)}.json`);
  }
  async saveFrame(payload) {
    const file = this.file('frames', payload?.id);

    if (typeof payload.data !== 'string' || Buffer.byteLength(payload.data) > MAX_FRAME_BYTES) throw new Error('The frame file is too large.');

    await checkFrame({ id: payload.id, data: payload.data });
    await atomic(file, payload.data);

    return { ok: true };
  }
  async frame(id) {
    return cappedRead(this.file('frames', id), MAX_FRAME_BYTES);
  }
  async save(raw) {
    const manifest = checkedManifest(raw);

    for (const id of manifest.frames) {
      const stat = await fs.stat(this.file('frames', id));

      if (!stat.isFile() || stat.size > MAX_FRAME_BYTES) throw new Error('The frame set has a missing frame.');
    }

    const file = this.file('sets', manifest.id);
    const current = await this.read(manifest.id);
    const createdAt = current?.createdAt ?? new Date().toISOString();

    await atomic(file, JSON.stringify({ manifest: raw, createdAt }));

    return { ok: true };
  }
  async read(id) {
    const file = this.file('sets', id);

    try {
      const record = JSON.parse(await cappedRead(file, MAX_MANIFEST_BYTES * 2 + 1024));
      const manifest = checkedManifest(record.manifest);

      if (manifest.id !== id || typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))) return null;

      return { manifest: record.manifest, createdAt: record.createdAt };
    } catch {
      return null;
    }
  }
  async list() {
    const entries = await fs.readdir(path.join(this.dir, 'sets'), { withFileTypes: true }).catch(() => []);
    const results = [];

    for (const entry of entries) {
      const id = entry.name.slice(0, -5);

      if (!entry.isFile() || !entry.name.endsWith('.json') || !isHash(id)) continue;

      const record = await this.read(id);

      if (record) results.push(summaryOf(checkedManifest(record.manifest), record.createdAt));
    }

    return results;
  }
}
