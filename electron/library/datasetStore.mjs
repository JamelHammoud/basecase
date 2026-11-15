import fs from 'node:fs';
import path from 'node:path';
import { checkedFileId, isSafeFileId } from '../backend/constants.mjs';
import { writeAtomic } from './atomicFile.mjs';
import { FrameSetStore } from './frameSetStore.mjs';
import { loadDatasetContent, saveDatasetContent } from './datasetContent.mjs';
import { mergeDatasetVersions } from './datasetVersions.mjs';

export const MAX_DATASET_BYTES = 16 * 1024 * 1024;

const EXTENSION = '.json';

const isPlain = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function checkedDataset(dataset) {
  if (!isPlain(dataset)) throw new Error('A dataset needs its file');

  checkedFileId(dataset.id);

  const json = JSON.stringify(dataset);

  if (Buffer.byteLength(json) > MAX_DATASET_BYTES) throw new Error('A dataset’s file is too large');

  return json;
}

const idOfFile = (name) => (name.endsWith(EXTENSION) ? name.slice(0, -EXTENSION.length) : null);

export class DatasetStore {
  constructor({ dir }) {
    this.dir = dir;
    this.images = new FrameSetStore({ dir: path.join(dir, '..', 'frame-sets') });
  }

  saveContent(bytes) {
    return saveDatasetContent(this.dir, bytes);
  }

  content(hash) {
    return loadDatasetContent(this.dir, hash);
  }

  fileOf(id) {
    return path.join(this.dir, `${checkedFileId(id)}${EXTENSION}`);
  }

  storedIds() {
    try {
      return fs.readdirSync(this.dir, { withFileTypes: true }).flatMap((entry) => {
        const id = entry.isFile() ? idOfFile(entry.name) : null;

        return isSafeFileId(id) ? [id] : [];
      });
    } catch {
      return [];
    }
  }

  read(id) {
    const file = this.fileOf(id);

    if (fs.statSync(file).size > MAX_DATASET_BYTES) return null;

    const dataset = JSON.parse(fs.readFileSync(file, 'utf-8'));

    return isPlain(dataset) && dataset.id === id ? dataset : null;
  }

  list() {
    return this.storedIds().flatMap((id) => {
      try {
        const dataset = this.read(id);

        return dataset ? [dataset] : [];
      } catch {
        return [];
      }
    });
  }

  current(id) {
    try {
      const dataset = this.read(id);

      if (!dataset) throw new Error('The saved dataset is damaged.');

      return dataset;
    } catch (error) {
      if (error.code === 'ENOENT') return null;

      throw error;
    }
  }

  save(dataset) {
    const incoming = JSON.parse(checkedDataset(dataset));
    const merged = mergeDatasetVersions(incoming, this.current(incoming.id));
    const json = checkedDataset(merged);
    const file = this.fileOf(incoming.id);

    fs.mkdirSync(this.dir, { recursive: true });
    writeAtomic(file, json);

    return { ok: true };
  }

  delete(ids) {
    if (!Array.isArray(ids)) throw new Error('Expected a list of datasets');

    const files = ids.map((id) => this.fileOf(id));

    for (const file of files) fs.rmSync(file, { force: true });

    return { deleted: ids };
  }
}
