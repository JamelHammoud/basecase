import { openWorldInWorker } from '../cases/worldClient';
import { MissingCollider, worldFilesOf } from '../cases/worldImport';
import type { DroppedFile } from '../cases/worldTypes';
import { showPlaceCase } from './caseCommands';
import { extensionOf } from './importRoute';
import type { WorkspaceCore } from './useWorkspaceCore';
import { keepWorld } from './worldStore';

const ANCHORS = new Set(['glb', 'gltf', 'ply', 'spz']);
const BESIDE = new Set([...ANCHORS, 'obj', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'ktx2']);

export interface WorldDrop {
  world: DroppedFile[];
  rest: File[];
}

const read = async (file: File): Promise<DroppedFile> => ({
  name: file.name,
  bytes: new Uint8Array(await file.arrayBuffer()),
});

export async function splitWorldDrop(files: File[]): Promise<WorldDrop> {
  const candidates = files.filter((f) => BESIDE.has(extensionOf(f.name)));

  if (!candidates.some((f) => ANCHORS.has(extensionOf(f.name)))) return { world: [], rest: files };

  const world = worldFilesOf(await Promise.all(candidates.map(read)));
  const taken = new Set(world.map((f) => f.name));

  return { world, rest: files.filter((f) => !taken.has(f.name)) };
}

const refusal = (error: unknown, files: DroppedFile[]) =>
  error instanceof MissingCollider && error.message
    ? error.message
    : `Couldn’t import ${files.map((f) => f.name).join(', ')}.`;

export async function openDroppedWorld(core: WorkspaceCore, files: DroppedFile[]) {
  try {
    const world = await openWorldInWorker(files);

    await keepWorld(world);
    showPlaceCase(core, world);
  } catch (error) {
    core.showToast(refusal(error, files), { tone: 'error' });
  }
}
