import path from 'node:path';
import { AgentKeys } from '../backend/agentKeys.mjs';
import { publicFetch } from '../publicFetch.mjs';
import { HUB_ENDPOINT, HubClient } from './hubClient.mjs';
import { checkedName, publishRepo } from './publishRepo.mjs';

const TOKEN = 'huggingface';
const NAME = 'huggingface-name';
const TOKEN_MAX = 512;

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function hubEndpoint(override = process.env.BASECASE_HUB_URL) {
  if (!override) return HUB_ENDPOINT;

  const url = new URL(override);

  if (url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname))) return url.origin;

  throw new Error('BASECASE_HUB_URL must be https, or http on this computer.');
}

export class HubAccount {
  constructor({ libraryDir, secrets, endpoint = () => hubEndpoint(), outbound = publicFetch }) {
    this.keys = new AgentKeys({ dir: path.join(libraryDir, 'agent-config'), secrets, file: 'hub-keys.json' });
    this.endpoint = endpoint;
    this.outbound = outbound;
  }

  client(token, again) {
    return new HubClient({ endpoint: this.endpoint(), token, outbound: this.outbound, again });
  }

  account() {
    const signedIn = !!this.keys.get(TOKEN);

    return { signedIn, name: signedIn ? (this.keys.get(NAME) ?? null) : null };
  }

  async signIn(token) {
    const value = String(token ?? '').trim();

    if (!value || value.length > TOKEN_MAX || /\s/.test(value)) throw new Error('That isn’t a Hugging Face token.');

    const who = await this.client(value, 'Save the token again').whoami();

    if (who.role === 'read') throw new Error('This token can only read. Make one with write access.');

    const name = checkedName(who.name);

    this.keys.set(TOKEN, value);
    this.keys.set(NAME, name);

    return this.account();
  }

  async publish({ name, files } = {}) {
    const token = this.keys.get(TOKEN);

    if (!token) throw new Error('Sign in to Hugging Face in Settings first.');

    const client = this.client(token);
    const namespace = this.keys.get(NAME) ?? (await client.whoami()).name;

    return publishRepo(client, { namespace, name, files });
  }
}
