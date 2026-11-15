import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import type { CollisionMesh } from './worldComponents';

export async function collisionMesh(mesh: CollisionMesh): Promise<CollisionMesh> {
  if (mesh.indices.length <= 60_000) return mesh;

  await MeshoptSimplifier.ready;

  if (!MeshoptSimplifier.supported) return mesh;

  const [indices] = MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, 60_000, 0.5, [
    'LockBorder',
    'ErrorAbsolute',
  ]);
  const [remap, count] = MeshoptSimplifier.compactMesh(indices);
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < remap.length; i++) {
    if (remap[i] === 0xffffffff) continue;

    positions.set(mesh.positions.subarray(i * 3, i * 3 + 3), remap[i] * 3);
  }

  return { positions, indices };
}
