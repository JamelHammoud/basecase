import { MCAP_TOO_LARGE, readMcap } from './mcapRead';
import { DataImportError, IMPORT_LIMITS, type SourceData, type SourceFile, type SourceFolder } from './types';

export const BAG_NOT_MCAP = 'Only bags stored as MCAP open.';
export const BAG_METADATA = 'This bag’s metadata.yaml can’t be read.';
export const bagMissing = (file: string) => `This bag is missing ${file}.`;

const METADATA = 'metadata.yaml';
const FILE_NAME_CHARS = 255;
const BAG_KEY = /^rosbag2_bagfile_information:\s*$/mu;
const STORAGE_KEY = /^\s*storage_identifier:\s*(.*)$/u;
const FILES_KEY = /^\s*relative_file_paths:\s*(.*)$/u;
const BLOCK_ITEM = /^\s*-\s+(.+)$/u;

const unquote = (value: string) => value.trim().replace(/^(['"])(.*)\1$/u, '$2');

const depth = (prefix: string) => prefix.split('/').length;

const refuseMetadata = () => new DataImportError(BAG_METADATA);

export function isRosbag2Folder(paths: string[]): string | null {
  const prefixes = paths
    .filter((path) => path === METADATA || path.endsWith(`/${METADATA}`))
    .map((path) => path.slice(0, path.length - METADATA.length));

  if (prefixes.length === 0) return null;

  return prefixes.reduce((best, prefix) => (depth(prefix) < depth(best) ? prefix : best));
}

function storageOf(lines: string[]) {
  for (const line of lines) {
    const match = STORAGE_KEY.exec(line);

    if (match) return unquote(match[1]);
  }

  return null;
}

function flowList(lines: string[], from: number, rest: string) {
  let text = rest;

  for (let i = from + 1; i < lines.length && !text.includes(']'); i++) text += lines[i];

  const close = text.indexOf(']');

  if (close < 0) throw refuseMetadata();

  return text
    .slice(1, close)
    .split(',')
    .map(unquote)
    .filter((item) => item !== '');
}

function blockList(lines: string[], from: number) {
  const items: string[] = [];

  for (let i = from + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;

    const match = BLOCK_ITEM.exec(lines[i]);

    if (!match) break;

    items.push(unquote(match[1]));
  }

  return items;
}

function filesOf(lines: string[]) {
  const at = lines.findIndex((line) => FILES_KEY.test(line));

  if (at < 0) return [];

  const rest = (FILES_KEY.exec(lines[at])?.[1] ?? '').trim();

  if (rest.startsWith('[')) return flowList(lines, at, rest);

  return rest === '' ? blockList(lines, at) : [];
}

const isPlainName = (name: string) =>
  name.length <= FILE_NAME_CHARS && name !== '.' && !name.includes('..') && !/[/\\]/u.test(name);

export function parseBagMetadata(text: string): string[] {
  if (!BAG_KEY.test(text)) throw refuseMetadata();

  const lines = text.split(/\r?\n/u);
  const storage = storageOf(lines);

  if (storage === null) throw refuseMetadata();

  if (storage !== 'mcap') throw new DataImportError(BAG_NOT_MCAP);

  const files = filesOf(lines);

  if (files.length === 0 || !files.every(isPlainName)) throw refuseMetadata();

  return files;
}

async function readMetadata(file: SourceFile) {
  if (file.size > IMPORT_LIMITS.metaBytes) throw refuseMetadata();

  const bytes = await file.read();

  if (bytes.byteLength > IMPORT_LIMITS.metaBytes) throw refuseMetadata();

  return new TextDecoder().decode(bytes);
}

function bagFile(folder: SourceFolder, prefix: string, name: string) {
  const file = folder.files.find((candidate) => candidate.path === `${prefix}${name}`);

  if (!file) throw new DataImportError(bagMissing(name));

  if (file.size > IMPORT_LIMITS.fileBytes) throw new DataImportError(MCAP_TOO_LARGE);

  return file;
}

export async function readRosbag2(folder: SourceFolder): Promise<SourceData> {
  const prefix = isRosbag2Folder(folder.files.map((file) => file.path));
  const metadata = folder.files.find((file) => file.path === `${prefix}${METADATA}`);

  if (prefix === null || !metadata) throw refuseMetadata();

  const names = parseBagMetadata(await readMetadata(metadata));
  const files = names.map((name) => bagFile(folder, prefix, name));
  const inputs = [];

  for (const [i, file] of files.entries()) inputs.push({ name: names[i], bytes: await file.read() });

  return readMcap(inputs);
}
