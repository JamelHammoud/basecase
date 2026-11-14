import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isSafeFileId } from './constants.mjs';

const digest = (text) => (text === null ? null : crypto.createHash('sha256').update(text).digest('hex'));

const idOf = (file) => (typeof file === 'string' && file.endsWith('.json') ? file.slice(0, -'.json'.length) : '');

function parsed(text) {
  try {
    return { model: JSON.parse(text) };
  } catch {
    return null;
  }
}

export class ModelChanges {
  constructor(modelsDir) {
    this.modelsDir = modelsDir;
    this.known = new Map();
  }

  wrote(id, text) {
    this.known.set(id, digest(text));
  }

  read(id) {
    try {
      return fs.readFileSync(path.join(this.modelsDir, `${id}.json`), 'utf-8');
    } catch {
      return null;
    }
  }

  changeOf(file) {
    const id = idOf(file);

    if (!isSafeFileId(id)) return null;

    const text = this.read(id);
    const hash = digest(text);

    if (this.known.has(id) && this.known.get(id) === hash) return null;

    const record = text === null ? { model: null } : parsed(text);

    if (!record) return null;

    this.known.set(id, hash);

    return { id, model: record.model };
  }
}
