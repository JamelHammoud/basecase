import { parquetMetadata, parquetReadObjects, parquetSchema } from 'hyparquet';
import { DataImportError, IMPORT_LIMITS, type SourceFile } from './types';

export type DatasetFiles = Map<string, SourceFile>;
export type Row = Record<string, unknown>;

const INFO_FILE = 'meta/info.json';

export const refuse = (message: string): never => {
  throw new DataImportError(message);
};

export const unreadable = (path: string) => refuse(`The dataset’s ${path} couldn’t be read.`);
export const mismatched = (path: string) => refuse(`The dataset’s ${path} doesn’t match its metadata.`);

const depthOf = (path: string) => path.split('/').length;

const rootOf = (path: string) => path.slice(0, -INFO_FILE.length).replace(/\/$/, '');

const isInfoFile = (path: string) => path === INFO_FILE || path.endsWith(`/${INFO_FILE}`);

export function datasetRootOf(paths: string[]): string | null {
  const infos = paths.filter(isInfoFile).sort((a, b) => depthOf(a) - depthOf(b) || a.localeCompare(b));

  return infos.length ? rootOf(infos[0]) : null;
}

export function filesUnder(files: SourceFile[], root: string): DatasetFiles {
  const prefix = root ? `${root}/` : '';
  const entries = files.filter((f) => f.path.startsWith(prefix)).map((f) => [f.path.slice(prefix.length), f] as const);

  return new Map(entries);
}

export function safePath(path: string): string {
  const unsafe = path.includes('..') || path.startsWith('/') || path.includes('\\');

  return unsafe ? refuse('The dataset’s meta/info.json points outside the dataset.') : path;
}

const TEMPLATE_FIELD = /\{(\w+)(?::0(\d)d)?\}/g;

const padded = (value: string | number, width: string | undefined) => {
  if (width === undefined) return String(value);

  const whole = typeof value === 'number' && Number.isInteger(value) && value >= 0;

  return whole ? String(value).padStart(Number(width), '0') : unreadable(INFO_FILE);
};

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  const filled = template.replace(TEMPLATE_FIELD, (_, name: string, width: string | undefined) =>
    name in values ? padded(values[name], width) : unreadable(INFO_FILE),
  );

  return /[{}]/.test(filled) ? unreadable(INFO_FILE) : safePath(filled);
}

export async function readBytes(files: DatasetFiles, path: string, limit = IMPORT_LIMITS.fileBytes) {
  const file = files.get(path) ?? refuse(`The dataset’s ${path} is missing.`);

  if (file.size > limit) refuse(`The dataset’s ${path} is too large.`);

  const bytes = await file.read();

  return bytes.byteLength > limit ? refuse(`The dataset’s ${path} is too large.`) : bytes;
}

const decoder = new TextDecoder();

const parsed = (text: string, path: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return unreadable(path);
  }
};

export const isRecord = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function readJson(files: DatasetFiles, path: string): Promise<Row> {
  const value = parsed(decoder.decode(await readBytes(files, path, IMPORT_LIMITS.metaBytes)), path);

  return isRecord(value) ? value : unreadable(path);
}

export async function readJsonLines(files: DatasetFiles, path: string): Promise<Row[]> {
  const text = decoder.decode(await readBytes(files, path, IMPORT_LIMITS.metaBytes));
  const lines = text.split('\n').filter((line) => line.trim());

  return lines.map((line) => {
    const value = parsed(line, path);

    return isRecord(value) ? value : unreadable(path);
  });
}

export interface ParquetRows {
  columns: Set<string>;
  rows: Row[];
}

async function parquetRows(buffer: ArrayBuffer, wanted?: string[]): Promise<ParquetRows> {
  const metadata = parquetMetadata(buffer);
  const columns = new Set(parquetSchema(metadata).children.map((c) => c.element.name));
  const present = wanted?.filter((name) => columns.has(name));
  const rows = await parquetReadObjects({ file: buffer, metadata, columns: present });

  return { columns, rows: rows as Row[] };
}

export async function readParquet(files: DatasetFiles, path: string, wanted?: string[]): Promise<ParquetRows> {
  const bytes = await readBytes(files, path);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  try {
    return await parquetRows(buffer, wanted);
  } catch {
    return unreadable(path);
  }
}

export const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;

  return typeof value === 'bigint' ? Number(value) : Number.NaN;
};

export const wholeNumber = (value: unknown, path: string): number => {
  const n = toNumber(value);

  return Number.isSafeInteger(n) && n >= 0 ? n : unreadable(path);
};

export const shortText = (value: unknown): string | null =>
  typeof value === 'string' ? value.slice(0, IMPORT_LIMITS.textChars) : null;
