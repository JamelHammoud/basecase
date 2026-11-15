import path from 'node:path';
import { AgentKeys } from '../backend/agentKeys.mjs';
import { readCapped } from '../publicFetch.mjs';
import { projectOfLink } from './link.mjs';

export const NO_KEY = 'Add a Roboflow API key in Settings ▸ Accounts.';

const KEY_REFUSED = 'Roboflow didn’t accept the API key in Settings ▸ Accounts.';
const BAD_DOWNLOAD = 'Roboflow download must stay on its own host.';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const API_ORIGIN = 'https://api.roboflow.com';
const JSON_LIMIT = 1e6;
const ZIP_LIMIT = 600e6;

export function roboflowEndpoint(override = process.env.BASECASE_ROBOFLOW_URL) {
  if (!override) return API_ORIGIN;

  const url = new URL(override);

  if (LOOPBACK.has(url.hostname) && /^https?:$/.test(url.protocol) && !url.username && !url.password) return url.origin;

  throw new Error('BASECASE_ROBOFLOW_URL must use a loopback address.');
}

function archiveUrl(link, origin) {
  if (typeof link !== 'string' || link.includes('\\')) throw new Error(BAD_DOWNLOAD);

  const url = new URL(link);
  const appArchive = url.origin === 'https://app.roboflow.com' && /^\/ds\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);

  if (url.username || url.password || url.hash || (url.origin !== origin && !appArchive)) throw new Error(BAD_DOWNLOAD);

  return url;
}

function latestVersion(payload, source) {
  const prefix = `${source.workspace}/${source.project}/`;
  const versions = payload?.project?.versions;

  if (!Array.isArray(versions) || versions.length > 10000)
    throw new Error('Choose a generated Roboflow dataset version.');

  const numbers = versions
    .map((v) => (typeof v?.id === 'string' && v.id.startsWith(prefix) ? v.id.slice(prefix.length) : ''))
    .filter((v) => /^[1-9]\d{0,5}$/.test(v))
    .map(Number);

  if (!numbers.length) throw new Error('Choose a generated Roboflow dataset version.');

  return Math.max(...numbers);
}

export class RoboflowAccount {
  constructor({ libraryDir, secrets, endpoint = () => roboflowEndpoint(), outbound = fetch }) {
    this.keys = new AgentKeys({ dir: path.join(libraryDir, 'agent-config'), secrets, file: 'roboflow-keys.json' });
    this.endpoint = endpoint;
    this.outbound = outbound;
  }

  account() {
    return { saved: !!this.keys.get('roboflow') };
  }

  async setKey(key) {
    const value = typeof key === 'string' ? key.trim() : '';

    if (!/^[A-Za-z0-9_-]{8,256}$/.test(value)) throw new Error('Paste a Roboflow API key.');

    const account = await this.json('/', value);

    if (typeof account?.workspace !== 'string' || !account.workspace) throw new Error(KEY_REFUSED);

    this.keys.set('roboflow', value);

    return this.account();
  }

  async response(url) {
    let res;

    try {
      res = await this.outbound(url, { redirect: 'error', signal: AbortSignal.timeout(120000) });
    } catch {
      throw new Error('Roboflow could not be reached. Import the dataset again.');
    }

    if (res.status === 401 || res.status === 403) throw new Error(KEY_REFUSED);

    if (!res.ok) throw new Error('Roboflow could not export the dataset. Import the dataset again.');

    return res;
  }

  async json(requestPath, key) {
    const url = new URL(requestPath, this.endpoint());

    url.searchParams.set('api_key', key);

    const res = await this.response(url);
    const bytes = await readCapped(res, JSON_LIMIT, 'The Roboflow reply');

    try {
      return JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new Error('Roboflow returned an unreadable reply. Import the dataset again.');
    }
  }

  async importProject(link) {
    const source = projectOfLink(link);
    const key = this.keys.get('roboflow');

    if (!key) throw new Error(NO_KEY);

    const projectPath = `/${source.workspace}/${source.project}`;
    const version = source.version ?? latestVersion(await this.json(projectPath, key), source);
    const reply = await this.json(`${projectPath}/${version}/coco`, key);

    if (reply?.ready === false)
      throw new Error('Roboflow is preparing the export. Import the dataset again when it finishes.');

    const url = archiveUrl(reply?.export?.link, this.endpoint());
    const res = await this.response(url);
    const data = new Uint8Array(await readCapped(res, ZIP_LIMIT, 'The Roboflow dataset'));

    return { name: `${source.project}-v${version}.zip`, data };
  }
}
