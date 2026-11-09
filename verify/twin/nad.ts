import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { repoPath } from '../lib/need';
import type { ServoLog } from './plant';

export interface NadSource {
  url: string;
  sha256: string;
  reader: string;
}

export interface NadLog {
  joint: string;
  payload: string;
  log: ServoLog;
}

const PIN = repoPath('verify', 'twin', 'nad.json');
const CACHE = repoPath('verify', 'out', 'nad', 'source.bin');

export function nadSource(): NadSource {
  if (!fs.existsSync(PIN))
    throw new Error(
      'NAD is not pinned: no public SO-101 NAD logs were located. A maintainer pins the URL, sha256 and a reader in verify/twin/nad.json.',
    );

  return JSON.parse(fs.readFileSync(PIN, 'utf8')) as NadSource;
}

async function download(url: string) {
  const response = await fetch(url);

  if (!response.ok) throw new Error(`NAD download failed: ${response.status}`);

  fs.mkdirSync(repoPath('verify', 'out', 'nad'), { recursive: true });
  fs.writeFileSync(CACHE, Buffer.from(await response.arrayBuffer()));
}

export async function nadBytes(source: NadSource): Promise<Buffer> {
  if (!fs.existsSync(CACHE)) await download(source.url);

  const bytes = fs.readFileSync(CACHE);
  const digest = createHash('sha256').update(bytes).digest('hex');

  if (digest !== source.sha256) throw new Error('NAD download does not match its pinned sha256');

  return bytes;
}

export async function nadLogs(): Promise<NadLog[]> {
  const source = nadSource();
  const bytes = await nadBytes(source);
  const reader = (await import(repoPath('verify', 'twin', source.reader))) as { read: (b: Buffer) => NadLog[] };

  return reader.read(bytes);
}
