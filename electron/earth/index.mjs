import path from 'node:path';
import { AgentKeys } from '../backend/agentKeys.mjs';
import { readCapped } from '../publicFetch.mjs';
import { serviceRefusal } from '../refusal.mjs';
import { OFF_HOST } from './offHost.mjs';

export const TILES_ENDPOINT = 'https://tile.googleapis.com';
export const ROOT_PATH = '/v1/3dtiles/root.json';
export const KEY_REFUSED = 'Google didn’t accept the Map Tiles key in Settings ▸ Accounts.';
export const NO_KEY = 'Add a Map Tiles key in Settings ▸ Accounts.';

const KEY = 'google-map-tiles';
const KEY_SHAPE = /^[A-Za-z0-9_-]{20,128}$/;
const TILE_PATH = /^\/v1\/3dtiles\/[A-Za-z0-9._~=\-/]+$/;
const SESSION = /^[A-Za-z0-9._~+/=-]{1,512}$/;
const TILE_BYTES_MAX = 32e6;
const TIMEOUT_MS = 30000;
const REFUSED_CODES = new Set([401, 403]);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function tilesEndpoint(override = process.env.BASECASE_EARTH_TILES_URL) {
  if (!override) return TILES_ENDPOINT;

  const url = new URL(override);

  if (url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname))) return url.origin;

  throw new Error('BASECASE_EARTH_TILES_URL must be https, or http on this computer.');
}

export function tileUrl(origin, requested) {
  const text = typeof requested === 'string' ? requested : '';

  if (!text.startsWith('/') || text.startsWith('//') || text.includes('\\')) throw new Error(OFF_HOST);

  const asked = new URL(text, origin);

  if (asked.origin !== origin || !TILE_PATH.test(asked.pathname) || asked.pathname.includes('..'))
    throw new Error(OFF_HOST);

  const url = new URL(asked.pathname, origin);
  const session = asked.searchParams.get('session');

  if (session && SESSION.test(session)) url.searchParams.set('session', session);

  return url;
}

export class EarthTiles {
  constructor({ libraryDir, secrets, endpoint = () => tilesEndpoint(), outbound = fetch }) {
    this.keys = new AgentKeys({ dir: path.join(libraryDir, 'agent-config'), secrets, file: 'earth-keys.json' });
    this.endpoint = endpoint;
    this.outbound = outbound;
  }

  account() {
    return { saved: !!this.keys.get(KEY) };
  }

  async setKey(key) {
    const value = String(key ?? '').trim();

    if (!KEY_SHAPE.test(value)) throw new Error('Paste a Map Tiles API key from Google Cloud.');

    await this.request(ROOT_PATH, value, 'Save the key again');
    this.keys.set(KEY, value);

    return this.account();
  }

  async tile(path) {
    const key = this.keys.get(KEY);

    if (!key) throw new Error(NO_KEY);

    return { data: new Uint8Array(await this.request(path, key, 'Place on Map again')) };
  }

  async request(path, key, again) {
    const url = tileUrl(this.endpoint(), path);

    url.searchParams.set('key', key);

    const res = await this.outbound(url, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });

    if (REFUSED_CODES.has(res.status) || (res.status === 400 && path === ROOT_PATH)) throw new Error(KEY_REFUSED);

    if (!res.ok) throw new Error(serviceRefusal('Google Map Tiles', { status: res.status, again }));

    return readCapped(res, TILE_BYTES_MAX, 'A map tile');
  }
}
