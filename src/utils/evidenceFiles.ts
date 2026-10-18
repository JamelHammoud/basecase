import { readImageFile } from './imageFile';
import { platformBridge } from './platformBridge';

/** A file picked or dropped, with its path inside the attached folder */
export interface PickedFile {
  file: File;
  relPath: string;
}

export interface PickedFolder {
  name: string;
  files: PickedFile[];
}

/** An attached folder the agent reads with read_evidence */
export interface EvidenceFolder {
  id: string;
  name: string;
  fileCount: number;
  imageCount: number;
  /** Files we couldn't read (PDF, HEIC, binaries…) */
  skipped: number;
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
const TEXT_RE =
  /\.(md|markdown|txt|text|json|jsonc|xml|urdf|xacro|sdf|mjcf|srdf|bvh|yaml|yml|csv|tsv|scad|py|js|mjs|ts|tsx|c|cc|cpp|h|hpp|ino|rs|go|toml|ini|cfg|conf|html?|svg|log|rst|tex)$/i;
const MESH_RE = /\.stl$/i;
const SKIP_DIRS = /^(\.|node_modules$|__pycache__$|venv$|\.venv$)/;

export const MAX_FOLDER_FILES = 400;
const MAX_TEXT_BYTES = 2_000_000;
const MAX_MESH_BYTES = 120_000_000;

export type EvidenceKind = 'image' | 'text' | 'mesh' | null;

export function evidenceKind(file: File | string): EvidenceKind {
  const name = typeof file === 'string' ? file : file.name;
  if (IMAGE_RE.test(name)) return 'image';
  if (MESH_RE.test(name)) return 'mesh';
  if (TEXT_RE.test(name)) return 'text';
  if (typeof file !== 'string' && file.type.startsWith('text/')) return 'text';
  return null;
}

/* ------------------------------------------------------------------ */
/* Collecting                                                          */
/* ------------------------------------------------------------------ */

/** Files from an <input webkitdirectory> pick, grouped by their top folder */
export function foldersFromInput(files: File[]): PickedFolder[] {
  const byTop = new Map<string, PickedFile[]>();
  for (const file of files) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const [top, ...rest] = rel.split('/');
    if (rest.some((seg) => SKIP_DIRS.test(seg)) || file.name.startsWith('.')) continue;
    const list = byTop.get(top) ?? [];
    list.push({ file, relPath: rest.join('/') || file.name });
    byTop.set(top, list);
  }
  return [...byTop.entries()].map(([name, list]) => ({ name, files: list }));
}

type Entry = FileSystemEntry;

const readAllEntries = (dir: FileSystemDirectoryEntry) =>
  new Promise<Entry[]>((resolve) => {
    const reader = dir.createReader();
    const all: Entry[] = [];
    const next = () =>
      reader.readEntries(
        (batch) => {
          if (!batch.length) return resolve(all);
          all.push(...batch);
          next();
        },
        () => resolve(all)
      );
    next();
  });

const entryFile = (entry: FileSystemFileEntry) =>
  new Promise<File | null>((resolve) => entry.file(resolve, () => resolve(null)));

async function walkFolder(dir: FileSystemDirectoryEntry, prefix: string, out: PickedFile[]) {
  for (const entry of await readAllEntries(dir)) {
    if (out.length >= MAX_FOLDER_FILES * 2) return;
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory) {
      if (!SKIP_DIRS.test(entry.name)) await walkFolder(entry as FileSystemDirectoryEntry, `${prefix}${entry.name}/`, out);
    } else {
      const file = await entryFile(entry as FileSystemFileEntry);
      if (file) out.push({ file, relPath: `${prefix}${entry.name}` });
    }
  }
}

/**
 * Splits a drop into loose files and folders. Must be called inside the drop handler:
 * the entries have to be taken before the event returns.
 */
export function collectDrop(dt: DataTransfer): Promise<{ loose: File[]; folders: PickedFolder[] }> {
  const items = Array.from(dt.items ?? []).filter((i) => i.kind === 'file');
  const entries = items.map((i) => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null));
  const filesNow = Array.from(dt.files ?? []);
  return (async () => {
    if (!entries.some((e) => e?.isDirectory)) return { loose: filesNow, folders: [] };
    const loose: File[] = [];
    const folders: PickedFolder[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry?.isDirectory) {
        const files: PickedFile[] = [];
        await walkFolder(entry as FileSystemDirectoryEntry, '', files);
        folders.push({ name: entry.name, files });
      } else {
        const file = entry ? await entryFile(entry as FileSystemFileEntry) : items[i].getAsFile();
        if (file) loose.push(file);
      }
    }
    return { loose, folders };
  })();
}

/* ------------------------------------------------------------------ */
/* Uploading                                                           */
/* ------------------------------------------------------------------ */

const newFolderId = () => `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Exact size of an STL, written as text the agent can read */
async function meshSummary(file: File): Promise<string> {
  const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
  const geometry = new STLLoader().parse(await file.arrayBuffer());
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const pos = geometry.getAttribute('position');
  let volume = 0;
  let area = 0;
  for (let i = 0; i + 8 < pos.array.length; i += 9) {
    const a = pos.array as ArrayLike<number>;
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5], a[i + 6], a[i + 7], a[i + 8]];
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  const f = (n: number) => (Math.round(n * 100) / 100).toString();
  const size = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
  geometry.dispose();
  return [
    `Mesh summary of ${file.name} (STL, units as stored, usually mm; axes as exported).`,
    `Bounding box size: ${size.map(f).join(' × ')} (x × y × z)`,
    `Min: [${[box.min.x, box.min.y, box.min.z].map(f).join(', ')}]  Max: [${[box.max.x, box.max.y, box.max.z].map(f).join(', ')}]`,
    `Volume: ${f(Math.abs(volume))}  Surface area: ${f(area)}  Triangles: ${pos.count / 3}`,
  ].join('\n');
}

async function uploadOne(folderId: string, folderName: string, { file, relPath }: PickedFile): Promise<'image' | 'file' | 'skip'> {
  const kind = evidenceKind(file);
  if (kind === 'image') {
    // Claude reads images at up to 1568 px; larger only costs time
    const { dataUrl } = await readImageFile(file, 1568);
    const mime = /^data:image\/(png|jpeg|webp|gif)/.exec(dataUrl)?.[1];
    if (!mime) return 'skip';
    const ext = mime === 'jpeg' ? 'jpg' : mime;
    const path = IMAGE_RE.test(relPath) && relPath.toLowerCase().endsWith(`.${ext}`) ? relPath : `${relPath.replace(IMAGE_RE, '')}.${ext}`;
    await platformBridge.saveEvidenceFile({ folderId, folderName, relPath: path, dataUrl });
    return 'image';
  }
  if (kind === 'text') {
    // Motion capture is read whole (retargeting needs every frame)
    const max = /\.bvh$/i.test(relPath) ? 40_000_000 : MAX_TEXT_BYTES;
    const body = await file.slice(0, max).text();
    const cut = file.size > max ? `\n[Cut at ${max / 1e6} MB of ${(file.size / 1e6).toFixed(1)} MB]` : '';
    await platformBridge.saveEvidenceFile({ folderId, folderName, relPath, text: body + cut });
    return 'file';
  }
  if (kind === 'mesh' && file.size <= MAX_MESH_BYTES) {
    await platformBridge.saveEvidenceFile({ folderId, folderName, relPath: `${relPath}.mesh.txt`, text: await meshSummary(file) });
    return 'file';
  }
  return 'skip';
}

/**
 * Copies a folder's readable files into library/evidence: images downscaled, text as is,
 * STLs as size summaries. Everything else is counted as skipped.
 */
export async function uploadEvidenceFolder(
  folder: PickedFolder,
  onProgress: (done: number, total: number) => void
): Promise<EvidenceFolder> {
  const id = newFolderId();
  const usable = folder.files.filter((f) => evidenceKind(f.file)).slice(0, MAX_FOLDER_FILES);
  let skipped = folder.files.length - usable.length;
  let imageCount = 0;
  let fileCount = 0;
  let done = 0;
  onProgress(0, usable.length);
  const queue = [...usable];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        const res = await uploadOne(id, folder.name, next);
        if (res === 'skip') skipped++;
        else {
          fileCount++;
          if (res === 'image') imageCount++;
        }
      } catch {
        skipped++;
      }
      onProgress(++done, usable.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { id, name: folder.name, fileCount, imageCount, skipped };
}
