import type { WorldItem } from '../sim/mjcfTypes';
import { geometryWorker } from '../three/geometryWorker';
import { partEdges } from '../utils/partEdges';

function needsHull(part: WorldItem): boolean {
  if (part.convexVertices || part.collisionHulls) return false;

  return !!(
    part.mesh ||
    part.cad ||
    part.sculptMesh ||
    part.deformers ||
    part.sheetTransform ||
    partEdges(part) ||
    !['box', 'cube', 'sphere', 'cylinder'].includes(part.kind)
  );
}

export async function preparedWorldItems(parts: WorldItem[]): Promise<WorldItem[]> {
  return Promise.all(
    parts.map(async (part) => {
      if (!needsHull(part)) return part;

      return { ...part, collisionHulls: await geometryWorker.call('worldCollision', part) };
    }),
  );
}
