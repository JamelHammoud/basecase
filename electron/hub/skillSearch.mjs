import { createHash } from 'node:crypto';
import { readCapped } from '../publicFetch.mjs';
import { checkedName } from './publishRepo.mjs';
import { gitBlob } from './gitBlob.mjs';
import { SKILL_DOWNLOADS, SKILL_FILE_BYTES } from './skillRepo.mjs';

const SEARCH_BYTES = 2 * 1024 * 1024;
const CANDIDATES_MAX = 100;
const CACHE_MAX = 128;
const CACHE_BYTES = 64 * 1024 * 1024;
const COMMIT = /^[a-f0-9]{40}$/;

const candidateBytes = (result) => Object.values(result.files).reduce((sum, text) => sum + Buffer.byteLength(text), 0);

function appendCandidates(found, batch, bytes) {
  for (const result of batch.filter(Boolean)) {
    bytes += candidateBytes(result);

    if (bytes > CACHE_BYTES) return null;

    found.push(result);
  }

  return bytes;
}

const boundedJson = async (response) =>
  JSON.parse((await readCapped(response, SEARCH_BYTES, 'Hub skill search')).toString());

function repoId(value) {
  const pieces = typeof value === 'string' ? value.split('/') : [];

  if (pieces.length !== 2) throw new Error('A skill repo needs an account and a name.');

  return pieces.map(checkedName).join('/');
}

function matchesBlob(info, path, value) {
  const file = info.siblings?.find((s) => s.rfilename === path);
  const forms = [JSON.stringify(value), `${JSON.stringify(value, null, 2)}\n`];

  return forms.some((json) =>
    file?.lfs
      ? file.lfs.sha256 === createHash('sha256').update(json).digest('hex')
      : file?.blobId === gitBlob(Buffer.from(json)),
  );
}

async function readCandidate(client, id) {
  const info = await boundedJson(await client.api(`/api/models/${id}/revision/main?blobs=true`));
  const revision = info.sha;

  if (typeof revision !== 'string' || !COMMIT.test(revision)) throw new Error('The skill has no commit.');

  if (
    !SKILL_DOWNLOADS.every((path) =>
      info.siblings?.some(
        (file) =>
          file.rfilename === path && Number.isSafeInteger(file.size) && file.size > 0 && file.size <= SKILL_FILE_BYTES,
      ),
    )
  )
    throw new Error('The skill repo is missing a file or has a file that is too large.');

  return { info, revision };
}

async function download(client, { id, info, revision }) {
  const files = {};

  for (const path of ['robot.json', 'skill.json']) {
    const bytes = await client.download(`/${id}/resolve/${revision}/${path}`, {
      maxBytes: SKILL_FILE_BYTES,
      label: path,
    });

    files[path] = bytes.toString('utf-8');
  }

  const skill = JSON.parse(files['skill.json']);

  if (
    !matchesBlob(info, 'policy.json', skill.controller?.policy) ||
    !matchesBlob(info, 'evidence.json', skill.evidence)
  )
    return null;

  return { repo: id, revision, files };
}

export class SkillSearch {
  cache = new Map();
  cachedBytes = 0;

  remember(key, result) {
    const bytes = result ? candidateBytes(result) : 0;

    this.cachedBytes -= this.cache.get(key)?.bytes ?? 0;
    this.cache.set(key, { result, bytes });
    this.cachedBytes += bytes;

    while (this.cache.size > CACHE_MAX || this.cachedBytes > CACHE_BYTES) {
      const oldest = this.cache.keys().next().value;

      this.cachedBytes -= this.cache.get(oldest).bytes;
      this.cache.delete(oldest);
    }
  }

  async candidate(client, raw) {
    try {
      const id = repoId(raw.id);
      const { info, revision } = await readCandidate(client, id);
      const key = `${client.origin}/${id}/${revision}`;

      if (this.cache.has(key)) return this.cache.get(key).result;

      const result = await download(client, { id, info, revision });

      this.remember(key, result);

      return result;
    } catch {
      return null;
    }
  }

  async find(client) {
    try {
      const lists = await Promise.all([
        client.api(`/api/models?filter=basecase-skill&limit=${CANDIDATES_MAX}&full=true`).then(boundedJson),
        client.api(`/api/models?filter=basecase&limit=${CANDIDATES_MAX}&full=true`).then(boundedJson),
      ]);
      const byId = new Map(
        lists
          .flat()
          .filter((r) => r && typeof r.id === 'string')
          .map((r) => [r.id, r]),
      );
      const candidates = [...byId.values()]
        .sort((a, b) => (a.id < b.id ? -1 : Number(a.id > b.id)))
        .slice(0, CANDIDATES_MAX);
      const found = [];
      let bytes = 0;

      for (let at = 0; at < candidates.length; at += 4) {
        const batch = await Promise.all(candidates.slice(at, at + 4).map((r) => this.candidate(client, r)));

        bytes = appendCandidates(found, batch, bytes);

        if (bytes === null) return found;
      }

      return found;
    } catch {
      return [];
    }
  }
}
