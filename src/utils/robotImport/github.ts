import { fetchBytes, RAW, unopenedRepo } from './sources';
import type { Tree } from './tree';

export interface RepoLink {
  owner: string;
  repo: string;
  rest: string[];
}

const API = 'https://api.github.com';
const NAME = /^[\w.-]+$/;

const TREE_LINK = /^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)(?:\/tree\/([^?#]+))?\/?(?:[?#].*)?$/;
const ARCHIVE_LINK =
  /^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/archive\/(?:refs\/(?:heads|tags)\/)?([^?#]+)\.zip(?:[?#].*)?$/i;

export function repoLink(url: string): RepoLink | null {
  const m = TREE_LINK.exec(url.trim()) ?? ARCHIVE_LINK.exec(url.trim());

  if (!m || !NAME.test(m[1]) || !NAME.test(m[2])) return null;

  const rest = (m[3] ?? '').split('/').filter(Boolean).map(decodeURIComponent);

  return { owner: m[1], repo: m[2].replace(/\.git$/, ''), rest };
}

interface Listing {
  tree?: Array<{ path: string; type: string }>;
}

async function listing(link: RepoLink, ref: string): Promise<string[] | null> {
  const url = `${API}/repos/${link.owner}/${link.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const body = await fetchBytes(url).catch(() => null);

  if (!body) return null;

  const parsed = JSON.parse(new TextDecoder().decode(body)) as Listing;

  return (parsed.tree ?? []).filter((t) => t.type === 'blob').map((t) => t.path);
}

async function refAndScope(link: RepoLink): Promise<{ ref: string; scope: string; paths: string[] } | null> {
  if (!link.rest.length) {
    const paths = await listing(link, 'HEAD');

    return paths && { ref: 'HEAD', scope: '', paths };
  }

  for (let n = 1; n <= Math.min(link.rest.length, 4); n++) {
    const ref = link.rest.slice(0, n).join('/');
    const paths = await listing(link, ref);

    if (paths) return { ref, scope: link.rest.slice(n).join('/'), paths };
  }

  return null;
}

export async function githubTree(link: RepoLink, url: string): Promise<{ tree: Tree; scope: string }> {
  const found = await refAndScope(link);

  if (!found) throw unopenedRepo(url);

  const encode = (path: string) => path.split('/').map(encodeURIComponent).join('/');
  const urlOf = (path: string) => `${RAW}/${link.owner}/${link.repo}/${encode(found.ref)}/${encode(path)}`;

  return {
    scope: found.scope,
    tree: {
      paths: found.paths,
      urlOf,
      read: (path) => fetchBytes(urlOf(path)).catch(() => null),
    },
  };
}
