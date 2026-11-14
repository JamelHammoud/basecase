import { ConvexMeshDecomposition } from 'vhacd-js/lib/vhacd.js';
import { MAX_HULL_VERTICES, MAX_HULLS, VOXELS, type Decompose } from './worldCollider';

export async function vhacdDecompose(): Promise<Decompose> {
  const decomposer = await ConvexMeshDecomposition.create();

  return (positions, indices) =>
    decomposer.computeConvexHulls(
      { positions, indices },
      { maxHulls: MAX_HULLS, maxVerticesPerHull: MAX_HULL_VERTICES, fillMode: 'surface', voxelResolution: VOXELS },
    );
}
