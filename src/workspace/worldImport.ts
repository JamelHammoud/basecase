import { MAX_WORLD_BYTES } from '../cases/worldImport/limits';
import { importWorldInWorker } from '../cases/worldImportClient';
import { CaseFileError } from '../cases/validate';
import { fileSize } from '../../electron/fileSize.mjs';
import type { DroppedFolder } from './droppedFolders';
import { importKindOf } from './importRoute';

const WORLD_MESH = /\.(?:glb|gltf|obj|spz|ply)$/i;
const OTHER_FLOWS = new Set(['robot', 'scene', 'data', 'motion', 'svg']);

export function splitWorldDrop(files: File[]) {
  const otherFlow = files.some((file) => OTHER_FLOWS.has(importKindOf(file.name, { cad: true }) ?? ''));

  if (otherFlow) return { worlds: [], remaining: files, worldFolders: false };

  if (files.some((file) => WORLD_MESH.test(file.name))) return { worlds: [files], remaining: [], worldFolders: true };

  const rooms = files.filter((file) => /\.json$/i.test(file.name));

  return {
    worlds: rooms.map((file) => [file]),
    remaining: files.filter((file) => !rooms.includes(file)),
    worldFolders: false,
  };
}

export async function readDroppedWorld(files: File[], folders: DroppedFolder[] = []) {
  const sources = [
    ...files.map((file) => ({ name: file.webkitRelativePath || file.name, blob: file })),
    ...folders.flatMap((folder) => folder.files.map((file) => ({ name: file.path, blob: file.blob }))),
  ];

  if (sources.length > 256 || sources.reduce((sum, file) => sum + file.blob.size, 0) > MAX_WORLD_BYTES)
    throw new CaseFileError(`World is over ${fileSize(MAX_WORLD_BYTES)}`);

  const bytes = await Promise.all(
    sources.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.blob.arrayBuffer()) })),
  );

  return importWorldInWorker({ files: bytes });
}
