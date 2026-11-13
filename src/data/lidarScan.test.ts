import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { describe, expect, it } from 'vitest';
import { componentArrays } from '../three/componentGeometry';
import { COMPONENTS, hasComponentMesh } from './components';
import { LIDAR_SCAN } from './lidarScan';

async function meshOf(id: string) {
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (u: URL) => Uint8Array };
  const buf = readFileSync(new URL(`../../public/parts/${id}.glb`, import.meta.url));
  const arrays = await componentArrays(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  );
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      arrays.pieces.flatMap((p) => [...p.position]),
      3,
    ),
  );
  geometry.computeBoundingBox();

  return { bvh: new MeshBVH(geometry), box: geometry.boundingBox! };
}

const catalogLidars = COMPONENTS.filter((c) => c.group === 'LiDAR' && hasComponentMesh(c.id)).map((c) => c.id);

describe('lidar scan frames', () => {
  it('cover every catalog lidar with a mesh, and nothing else', () => {
    expect(Object.keys(LIDAR_SCAN).sort()).toEqual([...catalogLidars].sort());
  });

  for (const [id, frame] of Object.entries(LIDAR_SCAN)) {
    it(`${id} scans from under its head`, async () => {
      const { bvh, box } = await meshOf(id);
      const origin = new THREE.Vector3(...frame.origin);
      const cap = bvh.raycastFirst(new THREE.Ray(origin, new THREE.Vector3(0, 1, 0)), THREE.DoubleSide);

      expect(box.containsPoint(origin)).toBe(true);
      expect(cap).not.toBeNull();
    }, 30_000);
  }

  it('point forward along a horizontal unit vector', () => {
    for (const { forward } of Object.values(LIDAR_SCAN)) {
      if (!forward) continue;

      const [x, y, z] = forward;

      expect(Math.abs(Math.hypot(x, y, z) - 1)).toBeLessThan(1e-6);
      expect(Math.abs(y)).toBeLessThan(1e-6);
    }
  });
});
