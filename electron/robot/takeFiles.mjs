import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { isSafeFileId } from '../backend/constants.mjs';
import { TRY_MANIFEST } from '../library/tryStore.mjs';
import { applyLogRow, takeOfHeader } from './robotTake.mjs';

export const TAKE_LOG = 'take.jsonl';
export const FLUSH_MS = 500;

function parsedLine(line) {
  try {
    return line ? JSON.parse(line) : null;
  } catch {
    return null;
  }
}

async function takeOfFile(file) {
  const lines = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });
  let take;

  for await (const line of lines) {
    const row = parsedLine(line);

    if (row === null) continue;

    if (take) applyLogRow(take, row);
    else take = takeOfHeader(row);

    if (!take) break;
  }

  return take ?? null;
}

export class TakeFiles {
  constructor({ store, flushMs = FLUSH_MS }) {
    this.store = store;
    this.flushMs = flushMs;
    this.open = null;
  }

  logOf(id) {
    return path.join(this.store.dirOf(id), TAKE_LOG);
  }

  start(id, header) {
    this.stop();
    fs.mkdirSync(this.store.dirOf(id), { recursive: true });
    fs.writeFileSync(this.logOf(id), `${JSON.stringify(header)}\n`);
    this.open = { id, lines: [], timer: setInterval(() => this.flush(), this.flushMs) };
  }

  append(id, row) {
    if (this.open?.id === id) this.open.lines.push(JSON.stringify(row));
  }

  flush() {
    const open = this.open;

    if (!open?.lines.length) return;

    const text = `${open.lines.join('\n')}\n`;

    open.lines = [];

    try {
      fs.appendFileSync(this.logOf(open.id), text);
    } catch {
      return;
    }
  }

  stop() {
    if (!this.open) return;

    this.flush();
    clearInterval(this.open.timer);
    this.open = null;
  }

  finish({ id, kept, take }) {
    if (this.open?.id === id) this.stop();

    const dir = this.store.dirOf(id);
    let saved = false;

    try {
      if (kept) this.store.save({ manifest: take.manifest(), recording: take.bytes() });

      saved = kept;
    } finally {
      fs.rmSync(saved ? path.join(dir, TAKE_LOG) : dir, { recursive: true, force: true });
    }
  }

  sink() {
    return {
      open: (id, header) => this.start(id, header),
      append: (id, row) => this.append(id, row),
      finish: (result) => this.finish(result),
    };
  }

  entries() {
    try {
      return fs.readdirSync(this.store.triesDir, { withFileTypes: true });
    } catch {
      return [];
    }
  }

  isOrphan(entry) {
    const dir = path.join(this.store.triesDir, entry.name);

    return (
      entry.isDirectory() &&
      isSafeFileId(entry.name) &&
      this.open?.id !== entry.name &&
      fs.existsSync(path.join(dir, TAKE_LOG)) &&
      !fs.existsSync(path.join(dir, TRY_MANIFEST))
    );
  }

  async recover() {
    this.store.videos?.sweep();

    const recovered = [];

    for (const entry of this.entries()) {
      if (this.isOrphan(entry)) recovered.push(...(await this.recoverOne(entry.name)));
    }

    return recovered;
  }

  async recoverOne(id) {
    try {
      const take = await takeOfFile(this.logOf(id));
      const kept = !!take && take.id === id && take.keeps(false);

      this.finish({ id, kept, take });

      return kept ? [id] : [];
    } catch {
      fs.rmSync(this.store.dirOf(id), { recursive: true, force: true });

      return [];
    }
  }
}
