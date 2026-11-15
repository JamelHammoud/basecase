import { refuse } from './validate';
import { reply } from '../utils/workerRpc';
import { hashWorldAsset, worldAssetJson } from './worldAssetHash';
import { decomposeWorld, type WorldHull } from './worldDecomposition';
import { readWorldFiles } from './worldImport';
import type { ImportedMeshWorld, ImportedWorld, WorldImportFile, WorldImportOptions } from './worldImportTypes';

export interface WorldImportRequest {
  files: WorldImportFile[];
  options?: WorldImportOptions;
}

export type PreparedWorld =
  | Extract<ImportedWorld, { kind: 'room' }>
  | { kind: 'mesh'; world: ImportedMeshWorld; pieces: WorldHull[]; hash: string; serializedJson: string };

function meshTransfers(world: ImportedMeshWorld): ArrayBuffer[] {
  const { mesh, splat } = world;

  return [
    mesh.positions.buffer,
    mesh.indices.buffer,
    mesh.normals.buffer,
    ...(mesh.colors ? [mesh.colors.buffer] : []),
    ...(mesh.uvs ? [mesh.uvs.buffer] : []),
    ...(splat ? [splat.bytes.buffer] : []),
    ...mesh.materials.flatMap((material) => (material.image ? [material.image.bytes.buffer] : [])),
  ] as ArrayBuffer[];
}

async function importWorld(request: WorldImportRequest) {
  const world = await readWorldFiles(request.files, request.options);

  if (world.kind === 'room') return reply<PreparedWorld>(world);

  return prepareMeshWorld(world);
}

export async function prepareMeshWorld(world: ImportedMeshWorld, exactPieces?: WorldHull[]) {
  const pieces = exactPieces ?? (await decomposeWorld(world.mesh));

  if (
    !pieces.length ||
    pieces.length > 64 ||
    pieces.some(
      (piece) =>
        piece.positions.length < 12 ||
        piece.positions.length > 96 * 3 ||
        !piece.positions.every((value) => Number.isFinite(value) && Math.abs(value) <= 500_000) ||
        !piece.indices.every((value) => value < piece.positions.length / 3),
    )
  )
    refuse('World mesh', 'exceeds its collision limits');

  const asset = { world, pieces };
  const hash = await hashWorldAsset(asset);
  const serializedJson = worldAssetJson(asset);
  const transfer = [
    ...new Set([...meshTransfers(world), ...pieces.flatMap((piece) => [piece.positions.buffer, piece.indices.buffer])]),
  ];

  return reply<PreparedWorld>({ kind: 'mesh', world, pieces, hash, serializedJson }, transfer as ArrayBuffer[]);
}

export const worldImportHandlers = { importWorld };
