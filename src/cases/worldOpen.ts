import { worldBounds, worldPieces, type Decompose } from './worldCollider';
import { readWorldSource, worldHash } from './worldImport';
import type { DroppedFile, StoredWorld, WorldSource } from './worldTypes';

export async function storedWorld(source: WorldSource, decompose: Decompose): Promise<StoredWorld> {
  return {
    hash: await worldHash(source.files),
    name: source.name,
    pieces: worldPieces(source, decompose),
    bounds: worldBounds(source.positions),
    files: source.files,
    look: source.look,
    frame: source.frame,
  };
}

export async function openWorld(files: DroppedFile[], decompose: () => Promise<Decompose>): Promise<StoredWorld> {
  const source = await readWorldSource(files);

  return storedWorld(source, await decompose());
}
