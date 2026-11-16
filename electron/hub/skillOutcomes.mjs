import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readCapped } from '../publicFetch.mjs';
import { writeAtomicAsync } from '../library/atomicFile.mjs';
import { gitBlob } from './gitBlob.mjs';
import { checkedName, publishRepo } from './publishRepo.mjs';

const RECORD_BYTES = 256 * 1024;
const SEARCH_BYTES = 2 * 1024 * 1024;
const RECORDS_MAX = 100;
const LOCAL_RECORDS_MAX = 1000;
const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const CARD =
  '---\nlibrary_name: basecase\ntags:\n- basecase-skill-outcome\n---\nReported skill installation outcome.\n';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const boundedJson = async (response) =>
  JSON.parse((await readCapped(response, SEARCH_BYTES, 'Hub outcomes')).toString());

function recordBytes(record) {
  const text = JSON.stringify(record);

  if (!text || Buffer.byteLength(text) > RECORD_BYTES) throw new Error('The installation outcome is too large.');

  return Buffer.from(text);
}

function repoId(value) {
  const pieces = typeof value === 'string' ? value.split('/') : [];

  if (pieces.length !== 2) throw new Error('An outcome repo needs an account and a name.');

  return pieces.map(checkedName).join('/');
}

async function remoteRecord(client, raw) {
  try {
    const id = repoId(raw?.id);
    const info = await boundedJson(await client.api(`/api/models/${id}/revision/main?blobs=true`));
    const file = info.siblings?.find((entry) => entry.rfilename === 'outcome.json');

    if (!COMMIT.test(info.sha) || !Number.isSafeInteger(file?.size) || file.size <= 0 || file.size > RECORD_BYTES)
      return null;

    const bytes = await client.download(`/${id}/resolve/${info.sha}/outcome.json`, {
      maxBytes: RECORD_BYTES,
      label: 'Installation outcome',
    });
    const matches = file.lfs ? file.lfs.sha256 === digest(bytes) : file.blobId === gitBlob(bytes);

    if (!matches) return null;

    const record = JSON.parse(bytes.toString());

    recordBytes(record);

    return record;
  } catch {
    return null;
  }
}

async function remoteRecords(client) {
  try {
    const list = await boundedJson(
      await client.api(`/api/models?filter=basecase-skill-outcome&limit=${RECORDS_MAX}&full=true`),
    );

    if (!Array.isArray(list)) return [];

    const found = [];

    for (let at = 0; at < Math.min(list.length, RECORDS_MAX); at += 4) {
      found.push(
        ...(
          await Promise.all(list.slice(at, Math.min(at + 4, RECORDS_MAX)).map((raw) => remoteRecord(client, raw)))
        ).filter(Boolean),
      );
    }

    return found;
  } catch {
    return [];
  }
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
