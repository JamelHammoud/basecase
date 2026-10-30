import * as THREE from 'three';
import { workerClient } from '../../utils/workerRpc';
import { plainVec3 } from '../analysis/sceneShapes';
import type { UsdzGeometry, UsdzJob, UsdzMaterial, usdzHandlers } from './usdzOps';

const client = workerClient<typeof usdzHandlers>(
  () => new Worker(new URL('./usdz.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./usdzOps')).usdzHandlers,
);

const DEFAULT_COLOR = '#cccccc';

function materialOf(mesh: THREE.Mesh): UsdzMaterial | null {
  const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
    THREE.MeshStandardMaterial | undefined;

  if (!material || !material.visible || !material.colorWrite) return null;

  return {
    color: material.color ? `#${material.color.getHexString()}` : DEFAULT_COLOR,
    roughness: material.roughness ?? 0.5,
    metalness: material.metalness ?? 0,
    opacity: material.transparent ? material.opacity : 1,
  };
}

function geometryOf(id: string, geometry: THREE.BufferGeometry): UsdzGeometry {
  const { position, normal } = geometry.attributes;

  return {
    id,
    positions: plainVec3(position),
    normals: normal ? plainVec3(normal) : null,
    index: geometry.index ? new Uint32Array(geometry.index.array as Uint16Array | Uint32Array) : null,
  };
}

export function usdzJob(objects: Array<{ id: string; object: THREE.Object3D }>): UsdzJob {
  const geometries = new Map<string, UsdzGeometry>();
  const meshes: UsdzJob['meshes'] = [];

  for (const { object } of objects) {
    object.updateWorldMatrix(true, true);
    object.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      const material = mesh.isMesh && mesh.geometry?.attributes?.position ? materialOf(mesh) : null;

      if (!material) return;

      const id = mesh.geometry.uuid;

      if (!geometries.has(id)) geometries.set(id, geometryOf(id, mesh.geometry));

      meshes.push({ geometry: id, matrix: mesh.matrixWorld.toArray(), material });
    });
  }

  return { geometries: [...geometries.values()], meshes };
}

export async function exportUsdz(objects: Array<{ id: string; object: THREE.Object3D }>): Promise<Uint8Array> {
  const job = usdzJob(objects);

  if (!job.meshes.length) return new Uint8Array();

  const transfer = job.geometries.flatMap((g) => [g.positions.buffer, g.normals?.buffer, g.index?.buffer]);

  return client.call(
    'usdz',
    job,
    transfer.filter((b): b is ArrayBuffer => !!b),
  );
}
