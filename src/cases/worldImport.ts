import { MAX_ROOM_BYTES, readRoomPlan, roomName } from './roomPlan';
import { refuse } from './validate';
import type { ImportedWorld, WorldImportFile, WorldImportOptions } from './worldImportTypes';
import { normalizeMesh } from './worldImport/geometry';
import { readGltf } from './worldImport/gltf';
import { droppedFiles, safePath } from './worldImport/limits';
import { readObj } from './worldImport/obj';
import { readSplat } from './worldImport/splat';

export { worldUnitScale } from './worldImport/geometry';
export type { ImportedWorld, ImportedMeshWorld, WorldImportFile, WorldImportOptions } from './worldImportTypes';

function roomImport(file: WorldImportFile): ImportedWorld {
  if (file.bytes.byteLength > MAX_ROOM_BYTES) return refuse('A room file', 'is over 8 MB');

  return { kind: 'room', room: readRoomPlan(new TextDecoder().decode(file.bytes), file.name) };
}

export async function readWorldFiles(
  files: WorldImportFile[],
  options: WorldImportOptions = {},
): Promise<ImportedWorld> {
  if (files.length === 1 && /\.json$/i.test(files[0].name)) return roomImport(files[0]);

  const resources = droppedFiles(files);
  const meshes = files.filter((file) => /\.(glb|gltf|obj)$/i.test(file.name));
  const rooms = files.filter((file) => /\.json$/i.test(file.name));
  const splats = files.filter((file) => /\.(spz|ply)$/i.test(file.name));

  if (meshes.length !== 1 || splats.length > 1 || rooms.length)
    return refuse('World', 'needs one GLB, glTF or OBJ collider and up to one splat');

  const file = meshes[0];
  const context = { name: safePath(file.name), files: resources };
  const mesh = /\.obj$/i.test(file.name) ? readObj(file.bytes, context) : readGltf(file.bytes, context);
  const transform = normalizeMesh(mesh, options);
  const splat = splats.length ? await readSplat(splats[0]) : undefined;

  return { kind: 'mesh', name: roomName(file.name), mesh, transform, ...(splat ? { splat } : {}) };
}
