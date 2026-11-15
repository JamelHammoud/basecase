import { ConvexMeshDecomposition } from 'vhacd-js/lib/vhacd.js';
import { CaseFileError } from './validate';
import { worldComponents, type CollisionMesh } from './worldComponents';
import { clipWorldHull, solidWorldHull } from './worldHull';
import { collisionMesh } from './worldCollisionMesh';

export type WorldHull = CollisionMesh;

export const MAX_WORLD_HULLS = 64;
export const MAX_WORLD_HULL_VERTICES = 96;

let decomposer: ReturnType<typeof ConvexMeshDecomposition.create> | undefined;

export async function decomposeWorld(mesh: CollisionMesh): Promise<WorldHull[]> {
  const components = worldComponents(mesh, MAX_WORLD_HULLS);

  decomposer ??= ConvexMeshDecomposition.create();

  const engine = await decomposer;
  const pieces: WorldHull[] = [];

  for (let i = 0; i < components.length; i++) {
    const component = await collisionMesh(components[i]);
    const remaining = MAX_WORLD_HULLS - pieces.length - (components.length - i - 1);
    const hulls = engine.computeConvexHulls(
      { positions: Float64Array.from(component.positions), indices: component.indices },
      {
        maxHulls: Math.min(remaining, Math.max(1, Math.floor(MAX_WORLD_HULLS / components.length))),
        maxVerticesPerHull: MAX_WORLD_HULL_VERTICES / 2,
        voxelResolution: 20_000,
        maxRecursionDepth: 8,
        fillMode: 'surface',
        shrinkWrap: true,
        minVolumePercentError: 1,
        findBestPlane: false,
        messages: 'none',
      },
    );

    if (!hulls.length) throw new CaseFileError('World mesh could not produce collision surfaces.');

    pieces.push(
      ...hulls.map((hull) =>
        solidWorldHull({ positions: clipWorldHull(hull.positions, component), indices: hull.indices }),
      ),
    );
  }

  if (pieces.length > MAX_WORLD_HULLS || pieces.some((piece) => piece.positions.length / 3 > MAX_WORLD_HULL_VERTICES)) {
    throw new CaseFileError('World mesh exceeds its collision limits.');
  }

  return pieces;
}
