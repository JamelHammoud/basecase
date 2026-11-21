import path from 'node:path';
import { AgentKeys } from '../backend/agentKeys.mjs';
import { publicFetch } from '../publicFetch.mjs';
import { policyOnnx } from '../robot/policyOnnx.mjs';
import { MODEL_PREFIX, modelResponse } from './modelRoute.mjs';
import { downloadModel } from './modelRepo.mjs';
import { downloadDataset } from './datasetRepo.mjs';
import { HUB_ENDPOINT, HubClient } from './hubClient.mjs';
import { checkedName, checkedTag, publishRepo } from './publishRepo.mjs';
import { checkedRevision, skillFiles } from '../../src/hub/skillDownloads.mjs';
import { SkillSearch } from './skillSearch.mjs';
import { SkillOutcomes } from './skillOutcomes.mjs';

const TOKEN = 'huggingface';
const NAME = 'huggingface-name';
const TOKEN_MAX = 512;

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

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
    this.libraryDir = libraryDir;
    this.endpoint = endpoint;
    this.outbound = outbound;
    this.skillSearch = new SkillSearch();
    this.outcomes = new SkillOutcomes(libraryDir);
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

  async publish({ name, files, kind = 'dataset', tag, includeRevision = false } = {}) {
    const token = this.keys.get(TOKEN);

    if (!token) throw new Error('Add a Hugging Face access token in Settings ▸ Accounts.');

    const versionTag = checkedTag(tag);

    const client = this.client(token, undefined, kind);
    const namespace = this.keys.get(NAME) ?? (await client.whoami()).name;
    const sent = kind === 'model' ? withPolicyOnnx(files) : files;

    return publishRepo(client, {
      namespace,
      name,
      files: sent,
      tag: versionTag,
      includeRevision: includeRevision === true,
    });
  }

  skillFiles(ref) {
    return skillFiles(this.client(this.keys.get(TOKEN) ?? undefined, 'Install again', 'model'), ref);
  }

  async modelFile(model) {
    const client = this.client(this.keys.get(TOKEN) ?? undefined, 'Download again', 'model');

    await downloadModel(client, { libraryDir: this.libraryDir, model });

    return { url: `${MODEL_PREFIX}${model.sha256}` };
  }

  modelResponse(request) {
    return modelResponse(request, this.libraryDir);
  }

  findSkills() {
    return this.skillSearch.find(this.client(this.keys.get(TOKEN) ?? undefined, 'Install again', 'model'));
  }

  outcomeConnection() {
    const token = this.keys.get(TOKEN);
    const namespace = this.keys.get(NAME);

    return token && namespace ? { client: this.client(token, undefined, 'model'), namespace } : null;
  }

  publishSkillOutcome(record) {
    return this.outcomes.publish(record, this.outcomeConnection());
  }

  skillOutcomes() {
    return this.outcomes.find(
      this.client(this.keys.get(TOKEN) ?? undefined, 'Install again', 'model'),
      this.outcomeConnection(),
    );
  }

  async datasetFiles({ owner, repo, rev } = {}) {
    const id = `${checkedName(owner)}/${checkedName(repo)}`;
    const revision = checkedRevision(rev);
    const client = this.client(this.keys.get(TOKEN) ?? undefined, 'Import again', 'dataset');

    return downloadDataset(client, { id, rev: revision });
  }
}
