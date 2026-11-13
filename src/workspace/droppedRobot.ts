import type { LocalFile } from '../utils/robotImport';

const MAX_FILES = 20_000;
const SKIPPED_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv']);

export const isRobotFileName = (name: string) => /\.(zip|urdf|mjcf)$/i.test(name);

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

export type DroppedRobotItem = FileSystemDirectoryEntry | File;

function robotItem(item: DataTransferItem): DroppedRobotItem | null {
  const entry = item.webkitGetAsEntry();

  if (entry?.isDirectory) return entry as FileSystemDirectoryEntry;

  const file = item.getAsFile();

  return file && isRobotFileName(file.name) ? file : null;
}

export function robotItems(items: DataTransferItemList): DroppedRobotItem[] {
  return Array.from(items)
    .filter((item) => item.kind === 'file')
    .map(robotItem)
    .filter((e): e is DroppedRobotItem => !!e);
}

export async function droppedRobotFiles(items: DroppedRobotItem[]): Promise<LocalFile[]> {
  const out: LocalFile[] = [];

  for (const item of items) {
    if (item instanceof File) out.push({ path: item.name, blob: item });
    else await collect(item, out);
  }

  return out;
}
