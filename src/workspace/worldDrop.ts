import { openWorldInWorker } from '../cases/worldClient';
import { MissingCollider, worldFilesOf } from '../cases/worldImport';
import { checkWorldSizes } from '../cases/worldRead';
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

const refusal = (error: unknown, files: Array<{ name: string }>) =>
  error instanceof MissingCollider && error.message
    ? error.message
    : `Couldn’t import ${files.map((f) => f.name).join(', ')}.`;

const refuse = (core: WorkspaceCore, error: unknown, files: Array<{ name: string }>) =>
  core.showToast(refusal(error, files), { tone: 'error' });

async function readWorldDrop(candidates: File[]): Promise<DroppedFile[]> {
  checkWorldSizes(candidates.map((f) => ({ name: f.name, byteLength: f.size })));

  return worldFilesOf(await Promise.all(candidates.map(read)));
}

export async function splitWorldDrop(core: WorkspaceCore, files: File[]): Promise<WorldDrop> {
  const candidates = files.filter((f) => BESIDE.has(extensionOf(f.name)));

  if (!candidates.some((f) => ANCHORS.has(extensionOf(f.name)))) return { world: [], rest: files };

  try {
    const world = await readWorldDrop(candidates);
    const taken = new Set(world.map((f) => f.name));

    return { world, rest: files.filter((f) => !taken.has(f.name)) };
  } catch (error) {
    refuse(core, error, candidates);

    return { world: [], rest: files.filter((f) => !candidates.includes(f)) };
  }
}

export async function openDroppedWorld(core: WorkspaceCore, files: DroppedFile[]) {
  try {
    const world = await openWorldInWorker(files);

    await keepWorld(world);
    showPlaceCase(core, world);
  } catch (error) {
    refuse(core, error, files);
  }
}
