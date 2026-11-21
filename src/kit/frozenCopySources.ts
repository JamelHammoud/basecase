import { copySourceKeys } from '../print/copySource';
import type { MeshData } from '../print/threeMf';
import type { ScenePart } from '../types/robotics';

export function copySourcesFromMeshes({ parts, meshes }: { parts: ScenePart[]; meshes: Record<string, MeshData> }) {
  const geometry = Object.fromEntries(
    Object.entries(meshes).map(([id, mesh]) => [
      id,
      {
        positions: mesh.vertices,
        indices: mesh.indices,
      },
    ]),
  );

  return copySourceKeys(parts, geometry);
}
