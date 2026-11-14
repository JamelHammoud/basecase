import path from 'node:path';
import { AgentKeys } from '../backend/agentKeys.mjs';
import { publicFetch } from '../publicFetch.mjs';
import { policyOnnx } from '../robot/policyOnnx.mjs';
import { downloadDataset } from './datasetRepo.mjs';
import { HUB_ENDPOINT, HubClient } from './hubClient.mjs';
import { checkedName, publishRepo } from './publishRepo.mjs';
import { SKILL_DOWNLOADS, SKILL_FILE_BYTES } from './skillRepo.mjs';

const TOKEN = 'huggingface';
const NAME = 'huggingface-name';
const TOKEN_MAX = 512;

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const REVISION = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,128}$/;

function checkedRevision(rev) {
  const value = String(rev ?? 'main');

  if (!REVISION.test(value)) throw new Error(`“${value.slice(0, 100)}” isn’t a branch of a Hugging Face repo.`);

  return value;
}

function policyJson(bytes) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf-8'));
  } catch {
    throw new Error('policy.json isn’t a policy.');
  }
}

function withPolicyOnnx(files) {
  const policy = files?.['policy.json'];

  if (!(policy instanceof Uint8Array)) return files;

  const onnx = policyOnnx(policyJson(policy));

  return onnx ? { ...files, 'policy.onnx': new Uint8Array(onnx) } : files;
}

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

  client(token, again, kind) {
    return new HubClient({ endpoint: this.endpoint(), token, outbound: this.outbound, again, kind });
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

  async publish({ name, files, kind = 'dataset' } = {}) {
    const token = this.keys.get(TOKEN);

    if (!token) throw new Error('Add a Hugging Face access token in Settings ▸ Accounts.');

    const client = this.client(token, undefined, kind);
    const namespace = this.keys.get(NAME) ?? (await client.whoami()).name;
    const sent = kind === 'model' ? withPolicyOnnx(files) : files;

    return publishRepo(client, { namespace, name, files: sent });
  }

  async skillFiles({ owner, repo, rev } = {}) {
    const id = `${checkedName(owner)}/${checkedName(repo)}`;
    const branch = encodeURIComponent(checkedRevision(rev));
    const client = this.client(this.keys.get(TOKEN) ?? undefined, 'Install again', 'model');
    const files = {};

    for (const path of SKILL_DOWNLOADS) {
      const bytes = await client.download(`/${id}/resolve/${branch}/${path}`, {
        maxBytes: SKILL_FILE_BYTES,
        label: path,
      });

      files[path] = bytes.toString('utf-8');
    }

    return { repo: id, files };
  }

  async datasetFiles({ owner, repo, rev } = {}) {
    const id = `${checkedName(owner)}/${checkedName(repo)}`;
    const revision = checkedRevision(rev);
    const client = this.client(this.keys.get(TOKEN) ?? undefined, 'Import again', 'dataset');

    return downloadDataset(client, { id, rev: revision });
  }
}
