import type { LocalFile } from '../utils/robotImport';

const MAX_FILES = 20_000;
const SKIPPED_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv']);

const fileOf = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject));

const batchOf = (reader: FileSystemDirectoryReader) =>
  new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));

async function collect(entry: FileSystemEntry, out: LocalFile[]): Promise<void> {
  if (out.length >= MAX_FILES) return;

  if (entry.isFile) {
    out.push({ path: entry.fullPath.replace(/^\/+/, ''), blob: await fileOf(entry as FileSystemFileEntry) });

    return;
  }

  if (SKIPPED_DIRS.has(entry.name)) return;

  const reader = (entry as FileSystemDirectoryEntry).createReader();

  for (let batch = await batchOf(reader); batch.length; batch = await batchOf(reader)) {
    for (const child of batch) await collect(child, out);
  }
}

export interface DroppedFolder {
  name: string;
  files: LocalFile[];
}

async function folderFiles(entry: FileSystemDirectoryEntry): Promise<DroppedFolder> {
  const files: LocalFile[] = [];

  await collect(entry, files);

  return { name: entry.name, files };
}

export function droppedFolders(items: DataTransferItemList) {
  const entries = Array.from(items).filter((item) => item.kind === 'file');
  const dirs = entries.flatMap((item) => {
    const entry = item.webkitGetAsEntry();

    return entry?.isDirectory ? [entry as FileSystemDirectoryEntry] : [];
  });
  const plain = entries.flatMap((item) => {
    const file = item.webkitGetAsEntry()?.isDirectory ? null : item.getAsFile();

    return file ? [file] : [];
  });

  return { plain, folders: Promise.all(dirs.map(folderFiles)) };
}
