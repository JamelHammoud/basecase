import { publicFetch, readCapped } from '../../publicFetch.mjs';
import { serviceRefusal } from '../../refusal.mjs';

export const SLANT_ORIGIN = 'https://slant3dapi.com';
export const SERVICE_NAME = 'Slant 3D';
export const KEY_REFUSED = 'Slant 3D didn’t accept the API key in Settings ▸ Accounts.';
export const UNREADABLE = 'Basecase couldn’t read Slant 3D’s reply and asks again in a minute.';
export const RETRY = { again: 'Basecase asks again', unreadable: UNREADABLE };
export const SAVE_KEY = {
  again: 'Save the key again',
  unreadable: 'Basecase couldn’t read Slant 3D’s reply. Save the key again in a minute.',
};

const API_PATH = '/v2/api';
const API_TIMEOUT_MS = 60000;
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const REPLY_MAX = 1_000_000;
const DETAIL_MAX = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class Refusal extends Error {}

export const isUuid = (value) => typeof value === 'string' && UUID.test(value);

function plainDetail(data) {
  const raw = typeof data?.message === 'string' ? data.message : data?.error;
  const text =
    typeof raw === 'string'
      ? [...raw]
          .map((c) => (c.charCodeAt(0) < 32 ? ' ' : c))
          .join('')
          .trim()
      : '';

  return text && !text.startsWith('<') ? text.slice(0, DETAIL_MAX) : undefined;
}

export class Slant3dClient {
  constructor({ key, origin = SLANT_ORIGIN, outbound = publicFetch, retry = RETRY }) {
    this.key = key;
    this.origin = new URL(origin).origin;
    this.outbound = outbound;
    this.retry = retry;
  }

  get unreadable() {
    return this.retry.unreadable;
  }

  async reached(send, url, init) {
    try {
      return await send(url, init);
    } catch {
      throw new Error(serviceRefusal(SERVICE_NAME, { again: this.retry.again }));
    }
  }

  async parsed(res) {
    try {
      return JSON.parse((await readCapped(res, REPLY_MAX)).toString('utf8'));
    } catch {
      throw new Error(this.unreadable);
    }
  }

  url(route) {
    const url = new URL(`${API_PATH}${route}`, this.origin);

    if (url.origin !== this.origin || !url.pathname.startsWith(`${API_PATH}/`)) throw new Error(this.unreadable);

    return url;
  }

  async call(route, { method = 'GET', json } = {}) {
    const res = await this.reached(fetch, this.url(route), {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      body: json === undefined ? undefined : JSON.stringify(json),
      headers: {
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${this.key}`,
      },
    });

    if (res.status === 401 || res.status === 403) throw new Error(KEY_REFUSED);

    const data = await this.parsed(res);

    if (res.ok && data?.success !== false) return data?.data;

    const detail = plainDetail(data);

    if (res.status >= 400 && res.status < 500 && res.status !== 429 && detail) throw new Refusal(detail);

    throw new Error(serviceRefusal(SERVICE_NAME, { status: res.status, detail, again: this.retry.again }));
  }

  async upload(href, bytes) {
    const url = new URL(href);
    const init = {
      method: 'PUT',
      body: bytes,
      headers: { 'Content-Type': 'application/octet-stream' },
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    };

    if (url.origin !== this.origin && url.protocol !== 'https:') throw new Error(this.unreadable);

    const res =
      url.origin === this.origin
        ? await this.reached(fetch, url, { ...init, redirect: 'manual' })
        : await this.reached(this.outbound, url.href, init);

    if (!res.ok) throw new Error(serviceRefusal(SERVICE_NAME, { status: res.status, again: this.retry.again }));
  }
}
