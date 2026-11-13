import { publicFetch } from '../publicFetch.mjs';

export const HUB_ENDPOINT = 'https://huggingface.co';

const API_TIMEOUT_MS = 120000;
const ERROR_TEXT_MAX = 300;
const TREE_PAGES_MAX = 50;
const LFS_JSON = 'application/vnd.git-lfs+json';

const REPO_ROOTS = {
  dataset: { api: '/api/datasets', page: '/datasets', git: '/datasets' },
  model: { api: '/api/models', page: '', git: '' },
};

export function repoRoots(kind) {
  const roots = REPO_ROOTS[kind];

  if (!roots) throw new Error('Hugging Face repos are datasets or models.');

  return roots;
}

function errorDetail(text) {
  try {
    return JSON.parse(text).error ?? text;
  } catch {
    return text;
  }
}

const nextLink = (header) => /<([^>]+)>;\s*rel="next"/.exec(header ?? '')?.[1] ?? null;

export class HubClient {
  constructor({ endpoint = HUB_ENDPOINT, token, outbound = publicFetch }) {
    this.origin = new URL(endpoint).origin;
    this.token = token;
    this.outbound = outbound;
  }

  url(path) {
    const url = new URL(path, this.origin);

    if (url.origin !== this.origin) throw new Error('A Hugging Face request left huggingface.co.');

    return url;
  }

  scrub(text) {
    return this.token ? text.split(this.token).join('…') : text;
  }

  async failure(res) {
    const detail = errorDetail((await res.text().catch(() => '')).slice(0, ERROR_TEXT_MAX * 4));

    return new Error(this.scrub(`Hugging Face answered ${res.status}. ${String(detail).slice(0, ERROR_TEXT_MAX)}`));
  }

  async api(path, { method = 'GET', json, body, headers = {}, allow = [] } = {}) {
    const res = await fetch(this.url(path), {
      method,
      body: json === undefined ? body : JSON.stringify(json),
      redirect: 'manual',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      headers: {
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (res.ok || allow.includes(res.status)) return res;

    throw await this.failure(res);
  }

  async whoami() {
    const who = await (await this.api('/api/whoami-v2')).json();

    return { name: String(who?.name ?? ''), role: who?.auth?.accessToken?.role ?? null };
  }

  createRepo(kind, name) {
    repoRoots(kind);

    return this.api('/api/repos/create', {
      method: 'POST',
      json: { name, private: false, ...(kind === 'model' ? {} : { type: kind }) },
      allow: [409],
    });
  }

  async listFiles(kind, repo) {
    const paths = [];
    let next = `${repoRoots(kind).api}/${repo}/tree/main?recursive=true`;

    for (let page = 0; next && page < TREE_PAGES_MAX; page += 1) {
      const res = await this.api(next, { allow: [404] });

      if (res.status === 404) return paths;

      for (const entry of await res.json()) if (entry?.type === 'file') paths.push(String(entry.path));

      next = nextLink(res.headers.get('link'));
    }

    return paths;
  }

  async preupload(kind, repo, files) {
    const res = await this.api(`${repoRoots(kind).api}/${repo}/preupload/main`, {
      method: 'POST',
      json: {
        files: files.map(({ path, bytes }) => ({
          path,
          size: bytes.byteLength,
          sample: Buffer.from(bytes.subarray(0, 512)).toString('base64'),
        })),
      },
    });

    return (await res.json()).files ?? [];
  }

  async lfsBatch(kind, repo, objects) {
    const res = await this.api(`${repoRoots(kind).git}/${repo}.git/info/lfs/objects/batch`, {
      method: 'POST',
      body: JSON.stringify({
        operation: 'upload',
        transfers: ['basic', 'multipart'],
        hash_algo: 'sha256',
        ref: { name: 'main' },
        objects: objects.map(({ oid, size }) => ({ oid, size })),
      }),
      headers: { Accept: LFS_JSON, 'Content-Type': LFS_JSON },
    });

    return (await res.json()).objects ?? [];
  }

  reach(url, init) {
    if (url.origin === this.origin) return fetch(url, { ...init, redirect: 'manual' });

    if (url.protocol !== 'https:') throw new Error('Hugging Face sent an upload address that isn’t https.');

    return this.outbound(url.href, init);
  }

  async send(href, init) {
    const res = await this.reach(new URL(href), init);

    if (res.ok) return res;

    throw await this.failure(res);
  }

  verifyHeaders(href) {
    const own = new URL(href).origin === this.origin;

    return { 'Content-Type': LFS_JSON, Accept: LFS_JSON, ...(own ? { Authorization: `Bearer ${this.token}` } : {}) };
  }

  async commit(kind, repo, lines) {
    const res = await this.api(`${repoRoots(kind).api}/${repo}/commit/main`, {
      method: 'POST',
      body: lines.map((line) => JSON.stringify(line)).join('\n'),
      headers: { 'Content-Type': 'application/x-ndjson' },
    });

    return res.json();
  }

  async retag(kind, repo, tag) {
    const api = `${repoRoots(kind).api}/${repo}/tag`;

    await this.api(`${api}/${tag}`, { method: 'DELETE', allow: [404] });
    await this.api(`${api}/main`, { method: 'POST', json: { tag } });
  }
}
