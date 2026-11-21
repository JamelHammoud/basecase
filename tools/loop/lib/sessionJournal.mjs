import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LOOP_DIR } from './paths.mjs';

export const SHARED_LANES = new Set(['lead', 'groom', 'ideas', 'digest']);

export const fingerprint = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const jsonLines = (text) =>
  String(text ?? '')
    .split('\n')
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });

export function sessionRecords({ since = Date.now() - 24 * 60 * 60_000 } = {}) {
  const dir = path.join(LOOP_DIR, 'state', 'sessions');

  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      try {
        const entry = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

        return entry.startedAt >= since ? [entry] : [];
      } catch {
        return [];
      }
    });
}

export function recordSession(entry) {
  const dir = path.join(LOOP_DIR, 'state', 'sessions');
  const id = entry.id ?? `${Date.now()}-${process.pid}-${crypto.randomUUID()}`;
  const file = path.join(dir, `${id}.json`);
  const temporary = `${file}.${process.pid}.tmp`;

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify({ id, ...entry }));
  fs.renameSync(temporary, file);

  return id;
}

export const continuationMatches = (session, options) =>
  session?.provider === 'codex' &&
  session.fingerprint === fingerprint({ cwd: options.cwd, brief: options.brief, schema: options.schema }) &&
  !options.sandbox &&
  typeof session.id === 'string';

export function updateSession(id, fields) {
  if (!id) return null;

  const file = path.join(LOOP_DIR, 'state', 'sessions', `${id}.json`);

  if (!fs.existsSync(file)) return null;

  return recordSession({ ...JSON.parse(fs.readFileSync(file, 'utf8')), ...fields, id });
}
