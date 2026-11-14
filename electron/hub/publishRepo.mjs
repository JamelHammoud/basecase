import crypto from 'node:crypto';
import { HUB_ENDPOINT, repoRoot } from './hubClient.mjs';

const NAME = /^(?!.*(?:--|\.\.))[A-Za-z0-9](?:[A-Za-z0-9._-]{0,94}[A-Za-z0-9])?$/;
const SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,128}$/;
const VERSION_TAG = /^v\d+\.\d+$/;
const FILES_MAX = 20000;
const PATH_MAX = 300;
const BATCH = 200;
const UPLOADS_AT_ONCE = 4;
const KEPT = new Set(['.gitattributes', 'README.md']);

export function checkedName(name) {
  const value = String(name ?? '');

  if (!NAME.test(value)) throw new Error(`“${value.slice(0, 100)}” can’t name a Hugging Face repo.`);

  return value;
}

const isFilePath = (path) =>
  typeof path === 'string' && path.length <= PATH_MAX && path.split('/').every((s) => SEGMENT.test(s));

const asBytes = (value) => (value instanceof Uint8Array ? value : null);

export function checkedFiles(files) {
  const entries = Object.entries(files && typeof files === 'object' ? files : {});

  if (!entries.length) throw new Error('There are no files to publish.');

  if (entries.length > FILES_MAX) throw new Error(`A publish can send at most ${FILES_MAX} files.`);

  return entries.map(([path, value]) => {
    const bytes = asBytes(value);

    if (!isFilePath(path) || !bytes) throw new Error(`“${String(path).slice(0, 100)}” can’t be published.`);

    return { path, bytes };
  });
}

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function codebaseVersion(entries) {
  const info = entries.find((e) => e.path === 'meta/info.json');

  if (!info) return null;

  try {
    const version = JSON.parse(Buffer.from(info.bytes).toString('utf-8')).codebase_version;

    return VERSION_TAG.test(version) ? version : null;
  } catch {
    return null;
  }
}

const chunks = (list, size) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

async function eachLimited(list, limit, run) {
  let next = 0;

  const worker = async () => {
    while (next < list.length) await run(list[next++]);
  };

  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
}

async function uploadMultipart(client, file, upload) {
  const header = upload.header ?? {};
  const size = Number(header.chunk_size);
  const keys = Object.keys(header)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));

  if (!Number.isFinite(size) || size <= 0 || !keys.length)
    throw new Error('Hugging Face sent an upload without parts.');

  const parts = [];

  for (const [i, key] of keys.entries()) {
    const res = await client.send(header[key], {
      method: 'PUT',
      body: file.bytes.subarray(i * size, (i + 1) * size),
    });

    parts.push({ partNumber: Number(key), etag: res.headers.get('etag') ?? '' });
  }

  await client.send(upload.href, {
    method: 'POST',
    body: JSON.stringify({ oid: file.oid, parts }),
    headers: { 'Content-Type': 'application/vnd.git-lfs+json', Accept: 'application/vnd.git-lfs+json' },
  });
}

async function uploadObject(client, file, actions) {
  if (!actions?.upload) return;

  if (actions.upload.header?.chunk_size) await uploadMultipart(client, file, actions.upload);
  else await client.send(actions.upload.href, { method: 'PUT', body: file.bytes });

  if (actions.verify?.href) {
    await client.send(actions.verify.href, {
      method: 'POST',
      body: JSON.stringify({ oid: file.oid, size: file.bytes.byteLength }),
      headers: client.verifyHeaders(actions.verify.href),
    });
  }
}

async function uploadLfs(client, { repo, files }) {
  const byOid = new Map(files.map((f) => [f.oid, f]));

  for (const batch of chunks(files, BATCH)) {
    const objects = await client.lfsBatch(
      repo,
      batch.map((f) => ({ oid: f.oid, size: f.bytes.byteLength })),
    );

    await eachLimited(objects, UPLOADS_AT_ONCE, async (object) => {
      const file = byOid.get(object?.oid);

      if (!file || object.error) throw new Error(`Hugging Face refused ${file?.path ?? 'a file'}.`);

      await uploadObject(client, file, object.actions);
    });
  }
}

async function uploadModes(client, { repo, entries }) {
  const modes = new Map();

  for (const batch of chunks(entries, BATCH)) {
    for (const answer of await client.preupload(repo, batch)) modes.set(answer.path, answer);
  }

  return modes;
}

function staleFiles(existing, entries) {
  const paths = new Set(entries.map((e) => e.path));
  const roots = new Set(entries.map((e) => e.path.split('/')[0]));

  return existing.filter((p) => !paths.has(p) && !KEPT.has(p) && roots.has(p.split('/')[0]));
}

function commitLines({ entries, modes, lfs, stale }) {
  const lfsPaths = new Set(lfs.map((f) => f.path));
  const regular = entries.filter((e) => !lfsPaths.has(e.path) && !modes.get(e.path)?.shouldIgnore);

  return [
    { key: 'header', value: { summary: 'Publish from Basecase', description: '' } },
    ...regular.map((e) => ({
      key: 'file',
      value: { path: e.path, content: Buffer.from(e.bytes).toString('base64'), encoding: 'base64' },
    })),
    ...lfs.map((f) => ({
      key: 'lfsFile',
      value: { path: f.path, algo: 'sha256', oid: f.oid, size: f.bytes.byteLength },
    })),
    ...stale.map((path) => ({ key: 'deletedFile', value: { path } })),
  ];
}

export function repoUrl(endpoint, repo, kind = 'dataset') {
  return `${new URL(endpoint ?? HUB_ENDPOINT).origin}${repoRoot(kind)}/${repo}`;
}

export async function publishRepo(client, { namespace, name, files }) {
  const repo = `${checkedName(namespace)}/${checkedName(name)}`;
  const entries = checkedFiles(files);

  await client.createRepo(name);

  const existing = await client.listFiles(repo);
  const modes = await uploadModes(client, { repo, entries });
  const lfs = entries
    .filter((e) => modes.get(e.path)?.uploadMode === 'lfs' && !modes.get(e.path)?.shouldIgnore)
    .map((e) => ({ ...e, oid: sha256(e.bytes) }));

  await uploadLfs(client, { repo, files: lfs });
  await client.commit(repo, commitLines({ entries, modes, lfs, stale: staleFiles(existing, entries) }));

  const version = codebaseVersion(entries);

  if (version) await client.retag(repo, version);

  return { repo, url: repoUrl(client.origin, repo, client.kind) };
}
