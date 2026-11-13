import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { AgentKeys } from '../backend/agentKeys.mjs';
import { openCadFile } from '../cadImport/openCadFile.mjs';
import { OnshapeClient } from './client.mjs';
import { fetchAssembly } from './fetchAssembly.mjs';
import { documentOfLink } from './link.mjs';

const KINDS = ['access', 'secret'];
const NAME = 'name';
const KEY = /^[A-Za-z0-9]{8,128}$/;
const REQUEST_ID = /^[\w-]{1,80}$/;

export const NO_KEYS = 'Add your Onshape API keys in Settings ▸ Accounts.';

export class OnshapeAccount {
  constructor({ libraryDir, secrets, converter, emit = () => {}, fetchImpl, origin, sleep = delay }) {
    this.keys = new AgentKeys({ dir: path.join(libraryDir, 'agent-config'), secrets, file: 'onshape-keys.json' });
    this.converter = converter;
    this.emit = emit;
    this.fetchImpl = fetchImpl;
    this.origin = origin;
    this.sleep = sleep;
  }

  stored() {
    const [access, secret] = KINDS.map((kind) => this.keys.get(kind));

    return access && secret ? { access, secret } : null;
  }

  account() {
    const [access, secret] = KINDS.map((kind) => !!this.keys.get(kind));

    return { access, secret, name: (access && secret && this.keys.get(NAME)) || null };
  }

  client(keys) {
    return new OnshapeClient({ keys, origin: this.origin, fetchImpl: this.fetchImpl });
  }

  async setKey({ kind, value } = {}) {
    const key = String(value ?? '').trim();

    if (!KINDS.includes(kind)) throw new Error('Unknown Onshape key.');

    if (key && !KEY.test(key)) throw new Error('That isn’t an Onshape API key.');

    this.keys.set(kind, key);
    this.keys.set(NAME, '');

    const keys = this.stored();

    if (!keys) return this.account();

    const who = await this.client(keys).json('/api/v10/users/sessioninfo');

    this.keys.set(NAME, String(who?.name ?? who?.email ?? '').slice(0, 120));

    return this.account();
  }

  async importAssembly({ link, requestId } = {}) {
    const doc = documentOfLink(link);
    const keys = this.stored();

    if (!keys) throw new Error(NO_KEYS);

    const say = (message) =>
      REQUEST_ID.test(String(requestId)) && this.emit({ type: 'onshape-progress', requestId, message });

    return fetchAssembly({
      client: this.client(keys),
      doc,
      say,
      sleep: this.sleep,
      convertStep: (bytes) => openCadFile(this.converter, { name: 'part.step', bytes }),
    });
  }
}
