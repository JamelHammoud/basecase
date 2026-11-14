import { OFF_HOST } from '../../electron/earth/offHost.mjs';

export const TILES_ORIGIN = 'https://tile.googleapis.com';
export const TILES_ROOT_PATH = '/v1/3dtiles/root.json';
export const TILES_ROOT_URL = `${TILES_ORIGIN}${TILES_ROOT_PATH}`;

const TILES_PREFIX = '/v1/3dtiles/';
const PATH_CHARS = /^\/v1\/3dtiles\/[A-Za-z0-9._~=\-/]+$/;

export const isJsonPath = (path: string) => new URL(path, TILES_ORIGIN).pathname.endsWith('.json');

export function tilePathOf(url: string, session: string | null): string {
  const parsed = new URL(url, TILES_ROOT_URL);
  const path = parsed.pathname;

  if (parsed.origin !== TILES_ORIGIN || !path.startsWith(TILES_PREFIX) || !PATH_CHARS.test(path) || path.includes('..'))
    throw new Error(OFF_HOST);

  parsed.searchParams.delete('key');

  if (session && !parsed.searchParams.has('session')) parsed.searchParams.set('session', session);

  return `${path}${parsed.search}`;
}

interface TileJson {
  content?: { uri?: string };
  children?: TileJson[];
}

export function sessionOf(tileset: unknown): string | null {
  const stack: TileJson[] = [(tileset as { root?: TileJson } | null)?.root ?? {}];

  while (stack.length) {
    const tile = stack.pop() as TileJson;
    const uri = tile.content?.uri;
    const session = uri ? new URL(uri, TILES_ROOT_URL).searchParams.get('session') : null;

    if (session) return session;

    stack.push(...(tile.children ?? []));
  }

  return null;
}
