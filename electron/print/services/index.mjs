import path from 'node:path';
import { AgentKeys } from '../../backend/agentKeys.mjs';
import { publicFetch } from '../../publicFetch.mjs';
import { Slant3dQuotes } from './slant3d.mjs';
import { SERVICE_NAME, SLANT_ORIGIN } from './slant3dClient.mjs';

const KEY = 'slant3d';
const KEY_MAX = 512;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export const NO_KEY = 'Add a Slant 3D API key in Settings ▸ Accounts.';

export function serviceOrigin(override = process.env.BASECASE_PRINT_SERVICE_URL) {
  if (!override) return SLANT_ORIGIN;

  const url = new URL(override);

  if (url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname))) return url.origin;

  throw new Error('BASECASE_PRINT_SERVICE_URL must be https, or http on this computer.');
}

export class PrintServices {
  constructor({ libraryDir, secrets, origin = () => serviceOrigin(), outbound = publicFetch }) {
    this.keys = new AgentKeys({ dir: path.join(libraryDir, 'agent-config'), secrets, file: 'print-service-keys.json' });
    this.origin = origin;
    this.outbound = outbound;
    this.quotes = null;
  }

  status() {
    return { name: SERVICE_NAME, hasKey: !!this.keys.get(KEY) };
  }

  quoter(key) {
    if (this.quotes?.key !== key) this.quotes = { key, client: this.connect(key) };

    return this.quotes.client;
  }

  connect(key) {
    return new Slant3dQuotes({ key, origin: this.origin(), outbound: this.outbound });
  }

  async setKey(value) {
    const key = String(value ?? '').trim();

    if (key.length > KEY_MAX || /\s/.test(key)) throw new Error('That isn’t a Slant 3D API key.');

    if (key) await this.connect(key).platform();

    this.keys.set(KEY, key);
    this.quotes = null;

    return this.status();
  }

  async quote({ shapes } = {}) {
    const key = this.keys.get(KEY);

    if (!key) throw new Error(NO_KEY);

    return { service: SERVICE_NAME, replies: await this.quoter(key).quote(shapes) };
  }
}
