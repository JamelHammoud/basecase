import path from 'node:path';
import { AgentKeys } from '../backend/agentKeys.mjs';
import { publicFetch } from '../publicFetch.mjs';
import { HUB_ENDPOINT, HubClient } from './hubClient.mjs';
import { checkedName, publishRepo } from './publishRepo.mjs';

const TOKEN = 'huggingface';
const NAME = 'huggingface-name';
const TOKEN_MAX = 512;

const hubEndpoint = () => process.env.BASECASE_HUB_URL || HUB_ENDPOINT;

export class HubAccount {
  constructor({ libraryDir, secrets, endpoint = hubEndpoint, outbound = publicFetch }) {
    this.keys = new AgentKeys({ dir: path.join(libraryDir, 'agent-config'), secrets, file: 'hub-keys.json' });
    this.endpoint = endpoint;
    this.outbound = outbound;
  }

  client(token) {
    return new HubClient({ endpoint: this.endpoint(), token, outbound: this.outbound });
  }

  account() {
    const signedIn = !!this.keys.get(TOKEN);

    return { signedIn, name: signedIn ? (this.keys.get(NAME) ?? null) : null };
  }

  async signIn(token) {
    const value = String(token ?? '').trim();

    if (!value) {
      this.keys.set(TOKEN, '');
      this.keys.set(NAME, '');

      return this.account();
    }

    if (value.length > TOKEN_MAX || /\s/.test(value)) throw new Error('That isn’t a Hugging Face token.');

    const who = await this.client(value).whoami();

    if (who.role === 'read') throw new Error('This token can only read. Make one with write access.');

    const name = checkedName(who.name);

    this.keys.set(TOKEN, value);
    this.keys.set(NAME, name);

    return this.account();
  }

  async publish({ kind, name, files } = {}) {
    const token = this.keys.get(TOKEN);

    if (!token) throw new Error('Sign in to Hugging Face in Settings first.');

    const client = this.client(token);
    const namespace = this.keys.get(NAME) ?? (await client.whoami()).name;

    return publishRepo(client, { kind, namespace, name, files });
  }
}
