import type { ScenePart } from '../../types/robotics';
import { geometryWorker } from '../geometryWorker';
import { packedMesh } from '../packedMesh';
import { CAD_CREASE_DEG, creaseKey, geometryFromArrays, MESH_CREASE_DEG, meshScale, type MeshSource } from './creased';
import { disposeCachedGeometry, hasShared, offerShared } from './sharedGeometry';

const PREPARE_MIN_INDICES = 3000;

const inflight = new Map<string, Promise<void>>();

function once(key: string, run: () => Promise<void>): Promise<void> {
  const running = inflight.get(key);

  if (running) return running;

  const job = run()
    .catch(() => {})
    .finally(() => inflight.delete(key));

  inflight.set(key, job);

  return job;
}

function creased(part: ScenePart, src: MeshSource, creaseDeg: number): Promise<void> | null {
  if (src.indices.length < PREPARE_MIN_INDICES) return null;

  const scale = meshScale(part.dimensions, src.baseSize);
  const key = creaseKey(src, creaseDeg, scale);

  if (hasShared(key)) return null;

  return once(key, async () => {
    const { positions, indices } = packedMesh(src);
    const { position, normal } = await geometryWorker.call('creased', { positions, indices, creaseDeg, scale });

    offerShared(key, geometryFromArrays(position, normal), disposeCachedGeometry);
  });
}

export function preparePart(part: ScenePart): Promise<void> | null {
  if (part.sculptMesh) return null;

  if (part.kind === 'mesh' && part.mesh) return creased(part, part.mesh, MESH_CREASE_DEG);

  if (part.kind === 'cad_part' && part.cad) return creased(part, part.cad, CAD_CREASE_DEG);

  return null;
}

export async function prepareParts(parts: ScenePart[]): Promise<void> {
  await Promise.all(parts.map(preparePart));
}
