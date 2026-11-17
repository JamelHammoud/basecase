import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeAtomic } from './atomicFile.mjs';
import { assembleSceneHistory, checkedHistoryHash, historyManifest, splitSceneHistory } from './historyFormat.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');

export class SceneHistoryStore {
  constructor(scenesDir) {
    this.folder = path.join(scenesDir, '.history');
    this.known = new Set();
  }

  file(hash) {
    checkedHistoryHash(hash);
    fs.mkdirSync(this.folder, { recursive: true });

    if (!fs.lstatSync(this.folder).isDirectory()) throw new Error('The scene history is damaged. Open another saved scene.');

    return path.join(this.folder, hash);
  }

  put(hash, json) {
    checkedHistoryHash(hash);

    if (digest(json) !== hash) throw new Error('The scene history is damaged. Open another saved scene.');

    if (this.known.has(hash)) return;

    const file = this.file(hash);

    if (fs.existsSync(file) && this.get(hash) === json) return;

    writeAtomic(file, json);

    if (this.known.size >= 100000) this.known.clear();

    this.known.add(hash);
  }

  get(hash, expectedBytes) {
    const file = this.file(hash);
    const stat = fs.lstatSync(file);

    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error('The scene history is damaged. Open another saved scene.');

    if (expectedBytes !== undefined && stat.size !== expectedBytes) throw new Error('The scene history is damaged. Open another saved scene.');

    const value = fs.readFileSync(file, 'utf8');

    if (digest(value) !== hash) throw new Error('The scene history is damaged. Open another saved scene.');

    if (this.known.size >= 100000) this.known.clear();

    this.known.add(hash);

    return value;
  }

  save(history) {
    const { blocks, manifest } = splitSceneHistory(history);

    blocks.forEach(([hash, json]) => this.put(hash, json));

    const hash = digest(manifest);

    this.put(hash, manifest);

    return hash;
  }

  load(hash) {
    const manifest = historyManifest(this.get(hash));
    const blocks = manifest.contentKeys.map((key, index) => [key, this.get(key, manifest.contentSizes[index])]);

    return assembleSceneHistory(manifest, blocks);
  }
}
