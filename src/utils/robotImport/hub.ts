import { safeEntryPath } from './archive';
import { fetchBytes, unopenedRepo } from './sources';
import type { Tree } from './tree';

export const HUB = 'https://huggingface.co';

export interface HubLink {
  kind: 'models' | 'datasets';
  owner: string;
  repo: string;
  rev: string;
  path: string;
  file: boolean;
}

const NAME = /^[\w.-]+$/;
const NOT_REPOS = new Set([
  'api',
  'blog',
  'chat',
  'collections',
  'docs',
  'join',
  'learn',
  'login',
  'models',
  'organizations',
  'papers',
  'posts',
  'pricing',
  'settings',
  'spaces',
  'tasks',
]);
const LINK =
  /^https:\/\/(?:www\.)?huggingface\.co\/(datasets\/)?([^/?#]+)\/([^/?#]+)(?:\/(tree|blob|resolve)\/([^/?#]+)(\/[^?#]*)?)?\/?(?:[?#].*)?$/i;
const MAX_PAGES = 20;

const isName = (name: string) => NAME.test(name) && name !== '.' && name !== '..';

function decoded(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

function linkPath(raw: string | undefined): string | null {
  const segments = (raw ?? '').split('/').filter(Boolean).map(decoded);

  if (segments.includes(null)) return null;

  return segments.length ? safeEntryPath(segments.join('/')) : '';
}

export function hubLink(url: string): HubLink | null {
  const m = LINK.exec(url.trim());

  if (!m || !isName(m[2]) || !isName(m[3]) || (!m[1] && NOT_REPOS.has(m[2].toLowerCase()))) return null;

  const rev = m[5] === undefined ? 'main' : decoded(m[5]);
  const path = linkPath(m[6]);

  if (!rev || rev === '.' || rev === '..' || path === null) return null;

  const view = m[4]?.toLowerCase();

  return {
    kind: m[1] ? 'datasets' : 'models',
    owner: m[2],
    repo: m[3],
    rev,
    path,
    file: view === 'blob' || view === 'resolve',
  };
}

const encode = (path: string) => path.split('/').map(encodeURIComponent).join('/');
const repoPath = (link: HubLink) => `${link.owner}/${link.repo}`;

export function hubFileUrl(link: HubLink, path: string): string {
  const prefix = link.kind === 'datasets' ? 'datasets/' : '';

  return `${HUB}/${prefix}${repoPath(link)}/resolve/${encodeURIComponent(link.rev)}/${encode(path)}`;
}

const treeApi = (link: HubLink) => `${HUB}/api/${link.kind}/${repoPath(link)}/tree/${encodeURIComponent(link.rev)}`;

function nextPage(res: Response, link: HubLink): string | null {
  const next = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(res.headers.get('link') ?? '')?.[1];

  return next?.startsWith(`${treeApi(link)}?`) ? next : null;
}

interface Entry {
  type?: string;
  path?: unknown;
}

const files = (entries: Entry[]) =>
  entries
    .filter((e) => e.type === 'file' && typeof e.path === 'string' && safeEntryPath(e.path) === e.path)
    .map((e) => e.path as string);

async function listing(link: HubLink): Promise<string[] | null> {
  const paths: string[] = [];
  let url: string | null = `${treeApi(link)}?recursive=true`;

  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res: Response | null = await fetch(url).catch(() => null);

    if (!res?.ok) return null;

    const body: unknown = await res.json().catch(() => null);

    if (!Array.isArray(body)) return null;

    paths.push(...files(body as Entry[]));
    url = nextPage(res, link);
  }

  return paths;
}

export async function hubTree(link: HubLink, url: string): Promise<{ tree: Tree; scope: string; entry?: string }> {
  const paths = await listing(link);

  if (!paths) throw unopenedRepo(url);

  const listed = new Set(paths);
  const urlOf = (path: string) => hubFileUrl(link, path);

  return {
    scope: link.file ? '' : link.path,
    entry: link.file ? link.path : undefined,
    tree: {
      paths,
      urlOf,
      read: async (path) => (listed.has(path) ? fetchBytes(urlOf(path)).catch(() => null) : null),
    },
  };
}
