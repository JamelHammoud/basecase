import fs from 'node:fs';
import path from 'node:path';
import { findUv, UV_MISSING } from '../uv.mjs';
import { assetKey, downloadAsset, parseAssetUrl } from './assets.mjs';
import { runConverter } from './converter.mjs';

const CONVERTER_VERSION = 3;

function isCurrent(out) {
  try {
    return JSON.parse(fs.readFileSync(path.join(out, 'model.json'), 'utf8')).version === CONVERTER_VERSION;
  } catch {
    return false;
  }
}

function readConverted(out) {
  const model = JSON.parse(fs.readFileSync(path.join(out, 'model.json'), 'utf8'));
  const files = {};

  for (const link of model.links) {
    if (link.mesh) files[link.mesh] = fs.readFileSync(path.join(out, link.mesh));
  }

  return { model, files };
}

export class SimReady {
  constructor(libraryDir, emit) {
    this.dir = path.join(libraryDir, 'simready');
    this.envDir = path.join(libraryDir, 'simready-env');
    this.emit = emit;
    this.pending = new Map();
  }

  status() {
    return { uv: !!findUv(), ready: fs.existsSync(path.join(this.envDir, 'pyvenv.cfg')) };
  }

  file({ key, file }) {
    const safe = /^[\w.@+-]+--[\w.@+-]+--[\w.@+-]+--[0-9a-f]{12}$/.test(String(key));
    const allowed = /^(visual\.glb|meshes\/\d+\.glb)$/.test(String(file));
    const target = path.join(this.dir, String(key), 'model', String(file));

    if (!safe || !allowed || !fs.existsSync(target)) return null;

    return fs.readFileSync(target);
  }

  fetch({ url, requestId }) {
    const asset = parseAssetUrl(url);
    const key = assetKey(asset);

    if (!this.pending.has(key)) {
      const job = this.load(asset, key, requestId).finally(() => this.pending.delete(key));

      this.pending.set(key, job);
    }

    return this.pending.get(key);
  }

  async load(asset, key, requestId) {
    const dir = path.join(this.dir, key);
    const out = path.join(dir, 'model');
    const raw = path.join(dir, 'files');
    const say = (message) => this.emit({ type: 'simready-progress', requestId, message });

    if (isCurrent(out)) return { key, ...readConverted(out) };

    const uv = findUv();

    if (!uv) throw new Error(UV_MISSING);

    const root = await downloadAsset(asset, raw, say);

    if (!fs.existsSync(path.join(this.envDir, 'pyvenv.cfg'))) say('Installing the USD reader…');
    else say('Converting…');

    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    await runConverter({ uv, envDir: this.envDir, root, out, say });
    fs.rmSync(raw, { recursive: true, force: true });

    return { key, ...readConverted(out) };
  }
}
