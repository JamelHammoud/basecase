import { MAX_UNPACKED_BYTES, unzipEntries, ZIP_TOO_LARGE } from '../../utils/robotImport/archive';
import { isLeRobotFolder, readLeRobot } from './lerobotRead';
import { readMcap } from './mcapRead';
import { isRosbag2Folder, readRosbag2 } from './rosbag2';
import { DataImportError, type SourceData, type SourceFile, type SourceFolder } from './types';

export interface PickedFile {
  path: string;
  blob: Blob;
}

export type ImportSource =
  { kind: 'files'; name: string; files: PickedFile[] } | { kind: 'zip'; name: string; blob: Blob };

export interface ReadSource {
  data: SourceData;
  hash: string;
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

const digest = async (bytes: Uint8Array) =>
  hex(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));

export const isMcapName = (path: string) => /\.mcap$/i.test(path);

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

async function zipFiles(blob: Blob): Promise<SourceFile[]> {
  if (blob.size > MAX_UNPACKED_BYTES) throw new DataImportError(ZIP_TOO_LARGE);

  const entries = unzipEntries(new Uint8Array(await blob.arrayBuffer()));

  return entries.map((e) => ({ path: e.path, size: e.data.byteLength, read: async () => e.data }));
}

export function sourceKind(paths: string[]): 'lerobot' | 'rosbag2' | 'mcap' | null {
  if (isLeRobotFolder(paths) !== null) return 'lerobot';

  if (isRosbag2Folder(paths) !== null) return 'rosbag2';

  return paths.length && paths.every(isMcapName) ? 'mcap' : null;
}

async function readMcapFiles(files: SourceFile[]) {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const read = await Promise.all(sorted.map(async (f) => ({ name: f.path.split('/').pop()!, bytes: await f.read() })));

  return readMcap(read);
}

export async function readSource(source: ImportSource): Promise<ReadSource | null> {
  const files = source.kind === 'zip' ? await zipFiles(source.blob) : source.files.map(blobFile);
  const kind = sourceKind(files.map((f) => f.path));

  if (!kind) return null;

  const hashed = new HashedFolder(source.name, files);
  const readers = {
    lerobot: () => readLeRobot(hashed.folder),
    rosbag2: () => readRosbag2(hashed.folder),
    mcap: () => readMcapFiles(hashed.folder.files),
  };
  const data = await readers[kind]();

  return { data, hash: await hashed.hash() };
}
