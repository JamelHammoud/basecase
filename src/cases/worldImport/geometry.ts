import { BufferAttribute, BufferGeometry, Quaternion, Vector3 } from 'three';
import { refuse } from '../validate';
import type { ImportedMeshWorld, WorldImportOptions, WorldMesh } from '../worldImportTypes';
import { worldImagePixels } from './image';
import { MAX_WORLD_BYTES, MAX_WORLD_COORDINATE, MAX_WORLD_TRIANGLES, MAX_WORLD_VERTICES } from './limits';

export function worldUnitScale(extent: number, units: WorldImportOptions['units'] = 'auto'): number {
  if (units === 'm') return 1000;

  if (units === 'mm') return 1;

  return extent >= 1000 ? 1 : 1000;
}

export function meshBounds(positions: Float32Array): WorldMesh['bounds'] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }

  return { min, max };
}

function floorPlane(mesh: WorldMesh) {
  const planes = new Map<string, { normal: Vector3; point: Vector3; area: number }>();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();

  for (let i = 0; i < mesh.indices.length; i += 3) {
    a.fromArray(mesh.positions, mesh.indices[i] * 3);
    b.fromArray(mesh.positions, mesh.indices[i + 1] * 3);
    c.fromArray(mesh.positions, mesh.indices[i + 2] * 3);

    const normal = b.sub(a).cross(c.sub(a));
    const area = normal.length() / 2;

    if (!area || !Number.isFinite(area)) continue;

    normal.normalize();

    if (normal.y < Math.SQRT1_2) continue;

    const key = [...normal.toArray().map((v) => Math.round(v * 1000)), Math.round(normal.dot(a) * 1000)].join(',');
    const plane = planes.get(key);

    planes.set(key, { normal: normal.clone(), point: a.clone(), area: area + (plane?.area ?? 0) });
  }

  return (
    [...planes.values()].sort((a, b) => b.area - a.area || a.point.y - b.point.y)[0] ??
    refuse('World', 'needs an upward-facing floor')
  );
}

function validateImages(materials: WorldMesh['materials']) {
  let bytes = 0;
  let pixels = 0;

  for (const material of materials) {
    bytes += material.image?.bytes.length ?? 0;
    pixels += material.image ? worldImagePixels(material.image.bytes) : 0;
  }

  if (bytes > MAX_WORLD_BYTES || pixels > 16777216)
    return refuse('World textures', 'exceed 64 MB or 16 million pixels');
}

export function normalizeMesh(mesh: WorldMesh, options: WorldImportOptions): ImportedMeshWorld['transform'] {
  validateImages(mesh.materials);

  if (
    !mesh.positions.length ||
    mesh.positions.length % 3 ||
    mesh.positions.length / 3 > MAX_WORLD_VERTICES ||
    !mesh.indices.length ||
    mesh.indices.length % 3 ||
    mesh.indices.length / 3 > MAX_WORLD_TRIANGLES
  )
    return refuse('World', 'exceeds the vertex or triangle limit');

  if (mesh.positions.some((n) => !Number.isFinite(n))) return refuse('World coordinates', 'must be finite');

  if (mesh.indices.some((n) => n >= mesh.positions.length / 3))
    return refuse('World', 'has an out-of-range triangle index');

  const bounds = meshBounds(mesh.positions);
  const extent = Math.max(...bounds.max.map((v, i) => v - bounds.min[i]));
  const scale = worldUnitScale(extent, options.units);
  const plane = floorPlane(mesh);
  const rotation = new Quaternion().setFromUnitVectors(plane.normal, new Vector3(0, 1, 0));
  const translation: [number, number, number] = [0, -plane.point.clone().applyQuaternion(rotation).y * scale, 0];
  const point = new Vector3();

  for (let i = 0; i < mesh.positions.length; i += 3) {
    point.fromArray(mesh.positions, i).applyQuaternion(rotation).multiplyScalar(scale);
    point.y += translation[1];

    if (Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) > MAX_WORLD_COORDINATE)
      return refuse('World', 'extends beyond 500 m');

    mesh.positions.set(
      point.toArray().map((v) => (Math.abs(v) < 0.001 ? 0 : v)),
      i,
    );
  }

  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(mesh.positions, 3));

  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeVertexNormals();
  mesh.normals = new Float32Array(geometry.getAttribute('normal').array);
  mesh.bounds = meshBounds(mesh.positions);
  geometry.dispose();

  return {
    scale,
    quaternion: rotation
      .toArray()
      .map((value) => (value === 0 ? 0 : value)) as ImportedMeshWorld['transform']['quaternion'],
    translation: translation.map((value) => (value === 0 ? 0 : value)) as ImportedMeshWorld['transform']['translation'],
  };
}
