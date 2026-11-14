import type { WorldItem } from '../sim/mjcfTypes';
import { worldItem, type Case, type WorldObject } from './schema';
import type { WorldPiece } from './worldTypes';

const kept = new Map<string, WorldPiece[]>();

export function keepPieces(hash: string, pieces: WorldPiece[]) {
  kept.set(hash, pieces);
}

export const piecesOf = (hash: string | undefined): WorldPiece[] | undefined => (hash ? kept.get(hash) : undefined);

export const isPiece = (o: Pick<WorldObject, 'piece'>) => o.piece !== undefined;

export function caseWorldItems(world: Case['world']): WorldItem[] {
  const pieces = piecesOf(world.mesh?.hash);

  return world.objects.map((o) => {
    const item = worldItem(o);

    if (!isPiece(o)) return item;

    const hull = pieces?.[o.piece!]?.vertices;

    return { ...item, visible: false, ...(hull ? { hull } : {}) };
  });
}

export function caseWorldPieces(world: Case['world']): Record<string, WorldPiece[]> {
  const hash = world.mesh?.hash;
  const pieces = piecesOf(hash);

  return hash && pieces ? { [hash]: pieces } : {};
}
