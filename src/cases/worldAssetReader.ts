import { base64ToBytes } from '../utils/base64';
import { asBoolean, asNumber, asRecord, asString, listOf, oneOf, optional, refuse, vector } from './validate';
import type { WorldAsset } from './worldAssets';
import type { WorldHull } from './worldDecomposition';
import type { ImportedMeshWorld, WorldMaterial, WorldMesh, WorldMeshGroup } from './worldImportTypes';

export const MAX_WORLD_ASSET_BYTES = 128 * 1024 * 1024;
export const MAX_WORLD_DATA_BYTES = 64 * 1024 * 1024;

const MAX_VERTICES = 600_000;
const MAX_INDICES = 600_000;
const MAX_COORDINATE = 500_000;
const MAX_GROUPS = 4096;

interface Budget {
  bytes: number;
  data: number;
}

function bytesOf(value: unknown, budget: Budget, data = false): Uint8Array {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(MAX_WORLD_ASSET_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    return refuse('World asset bytes', 'must be base64 data');

  const bytes = base64ToBytes(value);

  budget.bytes += bytes.byteLength;
  budget.data += data ? bytes.byteLength : 0;

  if (budget.bytes > MAX_WORLD_ASSET_BYTES || budget.data > MAX_WORLD_DATA_BYTES) refuse('World asset', 'is too large');

  return bytes;
}

function arrayOf(value: unknown, budget: Budget, integers = false): Float32Array | Uint32Array {
  const bytes = bytesOf(value, budget);

  if (bytes.length % 4 || bytes.length / 4 > MAX_VERTICES * 3)
    return refuse('World asset buffer', 'has the wrong size');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result = integers ? new Uint32Array(bytes.length / 4) : new Float32Array(bytes.length / 4);

  for (let i = 0; i < result.length; i++)
    result[i] = integers ? view.getUint32(i * 4, true) : view.getFloat32(i * 4, true);

  if (!integers && !result.every((n) => Number.isFinite(n) && Math.abs(n) <= MAX_COORDINATE))
    refuse('World asset coordinates', 'must be finite and within 500 m');

  return result;
}

function geometry(value: Record<string, unknown>, budget: Budget): WorldHull {
  const positions = arrayOf(value.positions, budget) as Float32Array;
  const indices = arrayOf(value.indices, budget, true) as Uint32Array;

  if (positions.length < 9 || positions.length % 3 || indices.length < 3 || indices.length % 3)
    refuse('World asset geometry', 'must hold triangles');

  if (indices.length > MAX_INDICES || !indices.every((n) => n < positions.length / 3))
    refuse('World asset indices', 'must name mesh vertices');

  return { positions, indices };
}

function readHull(value: unknown, budget: Budget): WorldHull {
  const hull = geometry(asRecord(value, 'World hull'), budget);

  if (hull.positions.length < 12 || hull.positions.length > 96 * 3 || hull.indices.length < 12)
    refuse('World hull', 'needs from 4 to 96 vertices and a closed surface');

  return hull;
}

function readImage(value: unknown, budget: Budget): NonNullable<WorldMaterial['image']> {
  const image = asRecord(value, 'World texture');
  const mimeType = oneOf(['image/png', 'image/jpeg', 'image/webp'])(image.mimeType, 'World texture type');
  const wrap = oneOf(['repeat', 'clamp', 'mirror'] as const);

  return {
    bytes: bytesOf(image.bytes, budget, true),
    mimeType,
    flipY: optional(asBoolean, image.flipY, 'World texture orientation'),
    wrapS: optional(wrap, image.wrapS, 'World texture horizontal wrapping'),
    wrapT: optional(wrap, image.wrapT, 'World texture vertical wrapping'),
  };
}

function readMaterial(value: unknown, budget: Budget): WorldMaterial {
  const material = asRecord(value, 'World material');
  const color = vector(4)(material.color, 'World material color') as WorldMaterial['color'];
  const roughness = asNumber(material.roughness, 'World material roughness');
  const metalness = asNumber(material.metalness, 'World material metalness');

  if (![...color, roughness, metalness].every((n) => n >= 0 && n <= 1))
    refuse('World material', 'must use values from 0 to 1');

  return {
    name: asString(material.name, 'World material name'),
    color,
    roughness,
    metalness,
    ...(material.image === undefined ? {} : { image: readImage(material.image, budget) }),
    ...(material.doubleSided === undefined ? {} : { doubleSided: asBoolean(material.doubleSided, 'World material') }),
  };
}

function readGroup(value: unknown, indices: number, materials: number): WorldMeshGroup {
  const group = asRecord(value, 'World mesh group');
  const start = asNumber(group.start, 'World group start');
  const count = asNumber(group.count, 'World group count');
  const material = asNumber(group.material, 'World group material');

  if (![start, count, material].every(Number.isSafeInteger) || start < 0 || count < 0 || start + count > indices)
    refuse('World mesh group', 'must lie within the mesh');

  if (start % 3 || count % 3 || material < 0 || material >= materials)
    refuse('World mesh group', 'must name triangles and a material');

  return { start, count, material };
}

function readBounds(value: unknown, positions: Float32Array): WorldMesh['bounds'] {
  const bounds = asRecord(value, 'World bounds');
  const min = vector(3)(bounds.min, 'World minimum') as [number, number, number];
  const max = vector(3)(bounds.max, 'World maximum') as [number, number, number];

  if (positions.some((n, i) => n < min[i % 3] - 0.1 || n > max[i % 3] + 0.1))
    refuse('World bounds', 'must contain every vertex');

  return { min, max };
}

function attribute(value: unknown, budget: Budget, length: number): Float32Array | undefined {
  if (value === undefined) return undefined;

  const array = arrayOf(value, budget) as Float32Array;

  return array.length === length ? array : refuse('World mesh attribute', 'has the wrong size');
}

function readMesh(value: unknown, budget: Budget): WorldMesh {
  const mesh = asRecord(value, 'World mesh');
  const { positions, indices } = geometry(mesh, budget);
  const normals = attribute(mesh.normals, budget, positions.length);
  const materials = listOf((m) => readMaterial(m, budget), 128)(mesh.materials, 'World materials');

  if (!normals || !materials.length) return refuse('World mesh', 'needs normals and materials');

  return {
    positions,
    indices,
    normals,
    bounds: readBounds(mesh.bounds, positions),
    colors: attribute(mesh.colors, budget, positions.length),
    uvs: attribute(mesh.uvs, budget, (positions.length / 3) * 2),
    groups: listOf((g) => readGroup(g, indices.length, materials.length), MAX_GROUPS)(mesh.groups, 'World groups'),
    materials,
  };
}

function readTransform(value: unknown): ImportedMeshWorld['transform'] {
  const transform = asRecord(value, 'World transform');
  const scale = asNumber(transform.scale, 'World scale');
  const quaternion = vector(4)(transform.quaternion, 'World rotation') as [number, number, number, number];
  const translation = vector(3)(transform.translation, 'World translation') as [number, number, number];

  if (scale <= 0 || scale > 1_000_000 || Math.abs(Math.hypot(...quaternion) - 1) > 0.001)
    refuse('World transform', 'needs a positive scale and unit quaternion');

  if (translation.some((n) => Math.abs(n) > MAX_COORDINATE)) refuse('World translation', 'must be within 500 m');

  return { scale, quaternion, translation };
}

function readSplat(value: unknown, budget: Budget): ImportedMeshWorld['splat'] {
  if (value === undefined) return undefined;

  const splat = asRecord(value, 'World splat');
  const count = asNumber(splat.count, 'World splat count');

  if (!Number.isSafeInteger(count) || count < 1 || count > 1_000_000) refuse('World splat', 'has too many points');

  return {
    name: asString(splat.name, 'World splat name'),
    format: oneOf(['spz', 'ply'] as const)(splat.format, 'World splat format'),
    count,
    bytes: bytesOf(splat.bytes, budget, true),
  };
}

export function readWorldAsset(value: unknown, budget: Budget = { bytes: 0, data: 0 }): WorldAsset {
  const asset = asRecord(value, 'World asset');
  const world = asRecord(asset.world, 'Imported world');
  const pieces = listOf((p) => readHull(p, budget), 64)(asset.pieces, 'World collision pieces');

  if (world.kind !== 'mesh' || !pieces.length) return refuse('World asset', 'needs a mesh and collision pieces');

  return {
    world: {
      kind: 'mesh',
      name: asString(world.name, 'World name'),
      mesh: readMesh(world.mesh, budget),
      transform: readTransform(world.transform),
      splat: readSplat(world.splat, budget),
    },
    pieces,
  };
}
