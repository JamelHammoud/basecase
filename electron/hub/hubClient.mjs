import { publicFetch, readCapped } from '../publicFetch.mjs';
import { serviceRefusal } from '../refusal.mjs';

export const HUB_ENDPOINT = 'https://huggingface.co';

const API_TIMEOUT_MS = 120000;
const REDIRECTS_MAX = 3;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const ERROR_TEXT_MAX = 300;
const TREE_PAGES_MAX = 50;
const LFS_JSON = 'application/vnd.git-lfs+json';

export const DATASETS = '/datasets';

const REPO_ROOTS = { dataset: DATASETS, model: '' };

export function repoRoot(kind) {
  if (!Object.hasOwn(REPO_ROOTS, kind)) throw new Error('A Hugging Face repo is a dataset or a model.');

  return REPO_ROOTS[kind];
}

const apiRoot = (kind) => `/api${kind === 'model' ? '/models' : DATASETS}`;

function errorDetail(text) {
  try {
    return JSON.parse(text).error ?? text;
  } catch {
    return text;
  }
}

export const TOKEN_REFUSED = 'Hugging Face didn’t accept the access token in Settings ▸ Accounts.';

const plainDetail = (detail) => {
  const text = String(detail ?? '').trim();

  return text && !text.startsWith('<') ? text.slice(0, ERROR_TEXT_MAX) : undefined;
};

const nextLink = (header) => /<([^>]+)>;\s*rel="next"/.exec(header ?? '')?.[1] ?? null;

export class HubClient {
  constructor({ endpoint = HUB_ENDPOINT, token, outbound = publicFetch, again = 'Publish again', kind = 'dataset' }) {
    this.origin = new URL(endpoint).origin;
    this.kind = kind;
    this.root = repoRoot(kind);
    this.apiRoot = apiRoot(kind);
    this.token = token;
    this.outbound = outbound;
    this.again = again;
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

    const message =
      res.status === 401
        ? TOKEN_REFUSED
        : serviceRefusal('Hugging Face', { status: res.status, detail: plainDetail(detail), again: this.again });

    return new Error(this.scrub(message));
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

  createRepo(name) {
    return this.api('/api/repos/create', {
      method: 'POST',
      json: { name, private: false, type: this.kind },
      allow: [409],
    });
  }

  async listFiles(repo) {
    const paths = [];
    let next = `${this.apiRoot}/${repo}/tree/main?recursive=true`;

    for (let page = 0; next && page < TREE_PAGES_MAX; page += 1) {
      const res = await this.api(next, { allow: [404] });

      if (res.status === 404) return paths;

      for (const entry of await res.json()) if (entry?.type === 'file') paths.push(String(entry.path));

      next = nextLink(res.headers.get('link'));
    }

    return paths;
  }

  async preupload(repo, files) {
    const res = await this.api(`${this.apiRoot}/${repo}/preupload/main`, {
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

  async lfsBatch(repo, objects) {
    const res = await this.api(`${this.root}/${repo}.git/info/lfs/objects/batch`, {
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

    if (url.protocol !== 'https:') throw new Error('Hugging Face sent an address that isn’t https.');

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

  async commit(repo, lines) {
    const res = await this.api(`${this.apiRoot}/${repo}/commit/main`, {
      method: 'POST',
      body: lines.map((line) => JSON.stringify(line)).join('\n'),
      headers: { 'Content-Type': 'application/x-ndjson' },
    });

    return res.json();
  }

  async retag(repo, tag) {
    const api = `${this.apiRoot}/${repo}/tag`;

    await this.api(`${api}/${tag}`, { method: 'DELETE', allow: [404] });
    await this.api(`${api}/main`, { method: 'POST', json: { tag } });
  }

  hop(url) {
    if (url.origin !== this.origin) return this.reach(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });

    return fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    });
  }

  async download(path, { maxBytes, label }) {
    let url = this.url(path);

    for (let hop = 0; hop <= REDIRECTS_MAX; hop += 1) {
      const res = await this.hop(url);
      const location = res.headers.get('location');

      if (REDIRECT_CODES.has(res.status) && location) {
        await res.body?.cancel();
        url = new URL(location, url);

        continue;
      }

      if (!res.ok) throw await this.failure(res);

      return readCapped(res, maxBytes, label);
    }

    throw new Error('Hugging Face sent too many redirects.');
  }
}
