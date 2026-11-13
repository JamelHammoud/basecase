import { geometryWorker } from '../../three/geometryWorker';
import { safeEntryPath, ZIP_TOO_LARGE } from './archive';
import { candidates, couldntRead, norm, type LocalFile, type Resolver } from './sources';

export interface Tree {
  paths: string[];
  read: (path: string) => Promise<ArrayBuffer | null>;
  urlOf?: (path: string) => string;
}

const isZip = (path: string) => /\.zip$/i.test(path);

async function unzipped(file: LocalFile): Promise<LocalFile[]> {
  const stem = file.path.replace(/\.zip$/i, '');
  const data = await file.blob.arrayBuffer();
  const entries = await geometryWorker.call('unzip', data, [data]).catch((error: unknown) => {
    const tooLarge = error instanceof Error && error.message === ZIP_TOO_LARGE;

    throw new Error(tooLarge ? ZIP_TOO_LARGE : 'Couldn’t open that zip. Unzip it and choose the folder.');
  });

  return entries.map((e) => ({ path: `${stem}/${e.path}`, blob: new Blob([e.data as Uint8Array<ArrayBuffer>]) }));
}

export async function localTree(files: LocalFile[]): Promise<Tree> {
  const expanded = await Promise.all(files.map((f) => (isZip(f.path) ? unzipped(f) : [f])));
  const byPath = new Map<string, Blob>();

  for (const f of expanded.flat()) {
    const path = safeEntryPath(f.path);

    if (path) byPath.set(path, f.blob);
  }

  return {
    paths: [...byPath.keys()],
    read: async (path) => (await byPath.get(path)?.arrayBuffer()) ?? null,
  };
}

export function pickedFiles(files: File[]): LocalFile[] {
  return files.map((f) => ({ path: norm(f.webkitRelativePath || f.name), blob: f }));
}

function byName(paths: string[], ref: string): string | undefined {
  const name = ref.split('/').pop()!.toLowerCase();

  return paths.find((p) => p.toLowerCase().endsWith('/' + name) || p.toLowerCase() === name);
}

export async function treeResolver(tree: Tree, entryPath: string): Promise<Resolver> {
  const known = new Set(tree.paths);
  const data = await tree.read(entryPath);

  if (!data) throw couldntRead(entryPath);

  return {
    entry: { name: entryPath, text: new TextDecoder().decode(data) },
    read: async (ref, from) => {
      const hit =
        candidates(ref, from ?? entryPath)
          .map((c) => norm(c).replace(/^\//, ''))
          .find((c) => known.has(c)) ?? byName(tree.paths, ref);
      const bytes = hit ? await tree.read(hit) : null;

      return bytes && hit ? { data: bytes, path: hit } : null;
    },
  };
}
