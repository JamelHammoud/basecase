import { base64ToBytes } from '../../utils/base64';
import { MAX_UNPACKED_BYTES, unzipEntries, ZIP_TOO_LARGE } from '../../utils/robotImport/archive';
import { readLeRobot } from './lerobotRead';
import { MCAP_TOO_LARGE, readMcap } from './mcapRead';
import { readRosbag2 } from './rosbag2';
import { sourceKind } from './sourceKind';
import { DataImportError, IMPORT_LIMITS, type SourceData, type SourceFile, type SourceFolder } from './types';

export interface PickedFile {
  path: string;
  blob: Blob;
}

export type ImportSource =
  | { kind: 'files'; name: string; files: PickedFile[] }
  | { kind: 'zip'; name: string; blob: Blob }
  | { kind: 'bytes'; name: string; files: Record<string, Uint8Array | string> };

export interface ReadSource {
  data: SourceData;
  hash: string;
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

const digest = async (bytes: Uint8Array) =>
  hex(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));

class HashedFolder {
  private readonly hashes = new Map<string, string>();

  readonly folder: SourceFolder;

  constructor(name: string, files: SourceFile[]) {
    this.folder = {
      name,
      files: files.map((f) => ({ ...f, read: () => this.read(f) })),
    };
  }

  private async read(file: SourceFile) {
    const bytes = await file.read();

    this.hashes.set(file.path, await digest(bytes));

    return bytes;
  }

  hash() {
    const lines = [...this.hashes].sort(([a], [b]) => a.localeCompare(b)).map(([path, h]) => `${path} ${h}`);

    return digest(new TextEncoder().encode(lines.join('\n')));
  }
}

function blobFile({ path, blob }: PickedFile): SourceFile {
  return { path, size: blob.size, read: async () => new Uint8Array(await blob.arrayBuffer()) };
}

const base64Bytes = (text: string) => Math.floor((text.length * 3) / 4) - (text.match(/=*$/u)?.[0].length ?? 0);

function bytesFile(path: string, bytes: Uint8Array | string): SourceFile {
  if (typeof bytes !== 'string') return { path, size: bytes.byteLength, read: async () => bytes };

  return { path, size: base64Bytes(bytes), read: async () => base64ToBytes(bytes) };
}

async function zipFiles(blob: Blob): Promise<SourceFile[]> {
  if (blob.size > MAX_UNPACKED_BYTES) throw new DataImportError(ZIP_TOO_LARGE);

  const entries = unzipEntries(new Uint8Array(await blob.arrayBuffer()));

  return entries.map((e) => ({ path: e.path, size: e.data.byteLength, read: async () => e.data }));
}

async function readMcapFiles(files: SourceFile[]) {
  if (files.some((f) => f.size > IMPORT_LIMITS.fileBytes)) throw new DataImportError(MCAP_TOO_LARGE);

  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const read = await Promise.all(sorted.map(async (f) => ({ name: f.path.split('/').pop()!, bytes: await f.read() })));

  return readMcap(read);
}

function sourceFiles(source: ImportSource): Promise<SourceFile[]> | SourceFile[] {
  if (source.kind === 'zip') return zipFiles(source.blob);

  if (source.kind === 'bytes') return Object.entries(source.files).map(([path, bytes]) => bytesFile(path, bytes));

  return source.files.map(blobFile);
}

export function sourceTransfer(source: ImportSource): Transferable[] {
  if (source.kind !== 'bytes') return [];

  const buffers = Object.values(source.files).flatMap((bytes) => (typeof bytes === 'string' ? [] : [bytes.buffer]));

  return [...new Set(buffers)].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
}

export async function readSource(source: ImportSource): Promise<ReadSource | null> {
  const files = await sourceFiles(source);
  const kind = sourceKind(files.map((f) => f.path));

  if (!kind) return null;

  const hashed = new HashedFolder(source.name, files);
  const readers = {
    lerobot: () => readLeRobot(hashed.folder),
    rosbag2: () => readRosbag2(hashed.folder),
    mcap: () => readMcapFiles(hashed.folder.files),
  };
  const data = await readers[kind]();

  return data && { data, hash: await hashed.hash() };
}
