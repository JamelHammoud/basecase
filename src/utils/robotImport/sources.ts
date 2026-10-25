import type { ConvertedFiles, ConvertedModel } from './simready';

export const RAW = 'https://raw.githubusercontent.com';

export type Source =
  | { kind: 'url'; url: string }
  | { kind: 'files'; files: File[] }
  | { kind: 'converted'; url: string; model: ConvertedModel; files: ConvertedFiles };

export interface Resolver {
  entry: { name: string; text: string };
  read: (ref: string, from?: string) => Promise<{ data: ArrayBuffer; path: string } | null>;
}

export function rawUrl(url: string): string {
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(url.trim());

  return m ? `${RAW}/${m[1]}/${m[2]}/${m[3]}` : url.trim();
}

async function lfsBytes(url: string, buf: ArrayBuffer): Promise<ArrayBuffer> {
  const head = new TextDecoder().decode(buf);
  const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(.+)$/.exec(url);

  if (!head.startsWith('version https://git-lfs') || !m) return buf;

  const lfs = await fetch(`https://media.githubusercontent.com/media/${m[1]}/${m[2]}/${m[3]}`);

  if (!lfs.ok) throw new Error(`LFS ${lfs.status}`);

  return lfs.arrayBuffer();
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);

  if (!res.ok) throw new Error(`${res.status}`);

  const buf = await res.arrayBuffer();

  return buf.byteLength < 300 ? lfsBytes(url, buf) : buf;
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/');

function joinPath(base: string, rel: string): string {
  const parts = base.split('/');

  parts.pop();

  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }

  return parts.join('/');
}

function packageCandidates(name: string, rest: string, entryPath: string): string[] {
  const out: string[] = [];
  const gh = /^\/([^/]+)\/([^/]+)\/([^/]+)\//.exec(entryPath);

  if (gh && (!name || name === gh[2])) out.push(`/${gh[1]}/${gh[2]}/${gh[3]}/${rest}`);

  const i = name ? entryPath.lastIndexOf(`/${name}/`) : -1;

  if (i >= 0) out.push(entryPath.slice(0, i + name.length + 2) + rest);

  out.push(joinPath(entryPath, `../${rest}`), joinPath(entryPath, rest), joinPath(entryPath, `../../${rest}`));

  const file = rest.split('/').pop()!;

  out.push(
    joinPath(entryPath, file),
    joinPath(entryPath, `meshes/${file}`),
    joinPath(entryPath, `../meshes/${file}`),
    joinPath(entryPath, `assets/${file}`),
  );

  return out;
}

function candidates(ref: string, entryPath: string): string[] {
  let r = ref.trim();

  if (/^file:\/\//.test(r)) r = r.replace(/^file:\/\//, '');

  const pkg = /^package:\/\/([^/]*)\/(.*)$/.exec(r);

  if (pkg) return [...new Set(packageCandidates(pkg[1], pkg[2], entryPath))];

  if (/^https?:\/\//.test(r) || r.startsWith('/')) return [r];

  return [joinPath(entryPath, r)];
}

export async function urlResolver(url: string): Promise<Resolver> {
  const entryUrl = rawUrl(url);
  const text = new TextDecoder().decode(
    await fetchBytes(entryUrl).catch(() => {
      throw new Error('Couldn’t download that file. Link to a .urdf or .xml file on GitHub or another public site.');
    }),
  );
  const u = new URL(entryUrl);
  const origin = u.origin;
  const entryPath = decodeURIComponent(u.pathname);
  let winning: number | null = null;

  return {
    entry: { name: entryPath.split('/').pop() ?? 'robot', text },
    read: async (ref, from) => {
      const base = from ?? entryPath;
      const list = candidates(ref, base);
      const order =
        winning !== null && winning < list.length
          ? [winning, ...list.keys()].filter((v, i, a) => a.indexOf(v) === i)
          : [...list.keys()];

      for (const i of order) {
        const path = list[i];

        try {
          const data = await fetchBytes(/^https?:/.test(path) ? path : origin + encodeURI(path));

          winning = i;

          return { data, path };
        } catch {}
      }

      return null;
    },
  };
}

export function filesResolver(files: File[]): Resolver & { pickEntry: () => Promise<void> } {
  const byPath = new Map(
    files.map((f) => [norm((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name), f]),
  );
  const entryFile =
    [...byPath].find(([p]) => /\.urdf$/i.test(p)) ??
    [...byPath].find(([p]) => /\.(xml|mjcf)$/i.test(p) && !/scene/i.test(p.split('/').pop()!)) ??
    [...byPath].find(([p]) => /\.(xml|mjcf)$/i.test(p));

  if (!entryFile) throw new Error('Choose a folder with a .urdf or MJCF .xml file.');

  const resolver = {
    entry: { name: entryFile[0], text: '' },
    pickEntry: async () => {
      resolver.entry.text = await entryFile[1].text();
    },
    read: async (ref: string, from?: string) => {
      const base = from ?? entryFile[0];

      for (const c of candidates(ref, base)) {
        const f = byPath.get(norm(c).replace(/^\//, ''));

        if (f) return { data: await f.arrayBuffer(), path: c };
      }

      const name = ref.split('/').pop()!.toLowerCase();
      const hit = [...byPath].find(([p]) => p.toLowerCase().endsWith('/' + name) || p.toLowerCase() === name);

      return hit ? { data: await hit[1].arrayBuffer(), path: hit[0] } : null;
    },
  };

  return resolver;
}

export async function inlineIncludes(text: string, read: Resolver['read'], from: string, depth = 0): Promise<string> {
  if (depth > 4 || !/<include\b/.test(text)) return text;

  const parts: string[] = [];
  let last = 0;

  for (const m of text.matchAll(/<include\s+file\s*=\s*"([^"]+)"\s*\/>/g)) {
    parts.push(text.slice(last, m.index));
    last = m.index! + m[0].length;

    const got = await read(m[1], from);

    if (!got) continue;

    const inner = await inlineIncludes(new TextDecoder().decode(got.data), read, got.path, depth + 1);
    const body = /<mujoco\b[^>]*>([\s\S]*)<\/mujoco>/.exec(inner)?.[1] ?? inner;

    parts.push(body);
  }

  parts.push(text.slice(last));

  return parts.join('');
}
