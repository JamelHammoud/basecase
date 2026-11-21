import { Matrix4, Vector3 } from 'three';
import type { WorldItem } from '../sim/mjcfTypes';
import { partMatrix } from '../utils/kinematics';
import { decomposeWorld } from '../cases/worldDecomposition';
import { buildPartGroup, releasePartGroup } from './buildPartMesh';
import { localTriangles } from './meshMeasure';

export async function worldCollision(part: WorldItem): Promise<Float32Array[]> {
  const group = buildPartGroup(part, false);
  let positions: Float32Array;

  try {
    positions = localTriangles(group);
  } finally {
    releasePartGroup(group);
  }

  const indices = Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
  const hulls = await decomposeWorld({ positions, indices });
  const turn = new Matrix4().extractRotation(partMatrix(part));
  const point = new Vector3();

  return hulls.map((hull) => {
    const vertices = hull.positions.slice();

    for (let i = 0; i < vertices.length; i += 3) point.fromArray(vertices, i).applyMatrix4(turn).toArray(vertices, i);

    return vertices;
  });
}
