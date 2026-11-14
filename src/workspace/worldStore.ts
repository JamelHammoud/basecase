import { keepPieces } from '../cases/worldPieces';
import type { StoredWorld } from '../cases/worldTypes';
import { indexedDbStore } from '../utils/keyValueStore';

const stored = indexedDbStore<StoredWorld>({ database: 'basecase-worlds', store: 'worlds' });
const loaded = new Map<string, Promise<StoredWorld | null>>();

export async function keepWorld(world: StoredWorld): Promise<void> {
  keepPieces(world.hash, world.pieces);
  loaded.set(world.hash, Promise.resolve(world));
  await stored.put(world.hash, world);
}

async function fromDisk(hash: string): Promise<StoredWorld | null> {
  const world = (await stored.get(hash).catch(() => null)) ?? null;

  if (world) keepPieces(hash, world.pieces);
  else loaded.delete(hash);

  return world;
}

export function loadWorld(hash: string): Promise<StoredWorld | null> {
  const known = loaded.get(hash);

  if (known) return known;

  const next = fromDisk(hash);

  loaded.set(hash, next);

  return next;
}

export async function loadWorlds(hashes: Array<string | undefined>): Promise<void> {
  await Promise.all([...new Set(hashes)].flatMap((h) => (h ? [loadWorld(h)] : [])));
}
