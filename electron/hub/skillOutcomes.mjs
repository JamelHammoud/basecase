import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeAtomicAsync } from '../library/atomicFile.mjs';
import { remoteRecords } from '../../src/hub/remoteOutcomes.mjs';
import { checkedName, publishRepo } from './publishRepo.mjs';

const RECORD_BYTES = 256 * 1024;
const RECORDS_MAX = 100;
const LOCAL_RECORDS_MAX = 1000;
const HASH = /^[a-f0-9]{64}$/;
const CARD =
  '---\nlibrary_name: basecase\ntags:\n- basecase-skill-outcome\n---\nReported skill installation outcome.\n';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function recordBytes(record) {
  const text = JSON.stringify(record);

  if (!text || Buffer.byteLength(text) > RECORD_BYTES) throw new Error('The installation outcome is too large.');

  return Buffer.from(text);
}

export class SkillOutcomes {
  constructor(libraryDir) {
    this.dir = path.join(libraryDir, 'skill-outcomes');
    this.pending = Promise.resolve();
  }

  file(id) {
    if (!HASH.test(id)) throw new Error('The installation outcome has no hash.');

    return path.join(this.dir, `${id}.json`);
  }

  async *local() {
    const names = await fs.readdir(this.dir).catch(() => []);

    for (const name of names.sort().slice(0, LOCAL_RECORDS_MAX)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;

      const saved = await this.saved(name.slice(0, -5));

      if (saved) yield saved;
    }
  }

  async saved(id) {
    try {
      const file = this.file(id);

      if ((await fs.stat(file)).size > RECORD_BYTES + 2048) return null;

      const saved = JSON.parse(await fs.readFile(file, 'utf8'));

      return digest(recordBytes(saved.record)) === id ? { ...saved, id } : null;
    } catch {
      return null;
    }
  }

  async save(record) {
    const bytes = recordBytes(record);
    const id = digest(bytes);
    const file = this.file(id);

    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify({ record, published: [] }), { flag: 'wx' }).catch((error) => {
      if (error.code !== 'EEXIST') throw error;
    });

    return id;
  }

  async publishOne({ client, namespace }, saved) {
    const key = `${client.origin}/${checkedName(namespace)}`;

    if (saved.published.includes(key)) return;

    const name = `basecase-install-${saved.id}`;
    const repo = `${namespace}/${name}`;
    const bytes = recordBytes(saved.record);
    const existing = await client.listFiles(repo);
    const already =
      existing.includes('outcome.json') &&
      digest(
        await client.download(`/${repo}/resolve/main/outcome.json`, {
          maxBytes: RECORD_BYTES,
          label: 'Installation outcome',
        }),
      ) === saved.id;

    if (!already)
      await publishRepo(client, { namespace, name, files: { 'README.md': Buffer.from(CARD), 'outcome.json': bytes } });

    saved.published.push(key);
    await writeAtomicAsync(this.file(saved.id), JSON.stringify({ record: saved.record, published: saved.published }));
  }

  async *queued(preferredId) {
    const preferred = preferredId && (await this.saved(preferredId));

    if (preferred) yield preferred;

    for await (const saved of this.local()) {
      if (saved.id !== preferredId) yield saved;
    }
  }

  flush(connection, preferredId) {
    const run = async () => {
      if (!connection) return;

      for await (const saved of this.queued(preferredId)) {
        try {
          await this.publishOne(connection, saved);
        } catch {
          return;
        }
      }
    };

    this.pending = this.pending.then(run, run);

    return this.pending;
  }

  async publish(record, connection) {
    const id = await this.save(record);

    await this.flush(connection, id);

    const saved = await this.saved(id);
    const key = connection && `${connection.client.origin}/${connection.namespace}`;

    return { stored: true, published: !!key && !!saved?.published.includes(key) };
  }

  async find(client, connection) {
    void this.flush(connection).catch(() => {});

    const remote = remoteRecords(client);
    const records = new Map();

    for await (const saved of this.local()) {
      records.set(saved.id, saved.record);

      if (records.size >= RECORDS_MAX) break;
    }

    for (const record of await remote) {
      if (records.size >= RECORDS_MAX) break;

      records.set(digest(recordBytes(record)), record);
    }

    return [...records.values()];
  }
}
