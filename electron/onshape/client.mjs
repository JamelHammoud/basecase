import { readCapped } from '../publicFetch.mjs';
import { serviceRefusal } from '../refusal.mjs';
import { ONSHAPE_ORIGIN } from './link.mjs';

const MAX_JSON_BYTES = 50_000_000;
const MAX_HOPS = 3;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MALFORMED_REPLY = 'Onshape sent a malformed reply.';

export const KEYS_REFUSED = 'Onshape didn’t accept the API keys in Settings ▸ Accounts.';
export const OFF_SITE = 'Onshape sent the request to another site, so it stopped.';

const STATUS_ERRORS = {
  401: KEYS_REFUSED,
  403: 'Your Onshape account can’t open that assembly.',
  404: 'Onshape couldn’t find that assembly. Check the link.',
};

const statusError = (status) =>
  new Error(STATUS_ERRORS[status] ?? serviceRefusal('Onshape', { status, again: 'Import again' }));

export class OnshapeClient {
  constructor({ keys, origin = ONSHAPE_ORIGIN, fetchImpl = globalThis.fetch }) {
    this.origin = new URL(origin).origin;
    this.authorization = `Basic ${Buffer.from(`${keys.access}:${keys.secret}`).toString('base64')}`;
    this.fetchImpl = fetchImpl;
  }

  url(path, query = {}) {
    const url = new URL(path, this.origin);

    if (url.origin !== this.origin || !url.pathname.startsWith('/api/')) throw new Error(OFF_SITE);

    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, String(value));

    return url;
  }

  async request(path, { method = 'GET', query, body, accept = 'application/json' } = {}) {
    let url = this.url(path, query);
    let init = { method, body: body === undefined ? undefined : JSON.stringify(body) };

    for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
      const res = await this.fetchImpl(url.href, {
        ...init,
        redirect: 'manual',
        headers: {
          Authorization: this.authorization,
          Accept: accept,
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
      });

      if (!REDIRECTS.has(res.status)) return this.checked(res);

      await res.body?.cancel();

      const next = new URL(res.headers.get('location') ?? '', url);

      if (next.origin !== this.origin || !next.pathname.startsWith('/api/')) throw new Error(OFF_SITE);

      url = next;

      if (res.status === 303) init = { method: 'GET', body: undefined };
    }

    throw new Error(OFF_SITE);
  }

  async checked(res) {
    if (res.ok) return res;

    await res.body?.cancel();

    throw statusError(res.status);
  }

  async json(path, options) {
    const res = await this.request(path, options);

    const text = (await readCapped(res, MAX_JSON_BYTES, 'Onshape’s reply')).toString('utf8');

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(MALFORMED_REPLY);
    }
  }

  async bytes(path, maxBytes) {
    const res = await this.request(path, { accept: 'application/octet-stream' });

    return new Uint8Array(await readCapped(res, maxBytes, 'The exported part'));
  }
}
