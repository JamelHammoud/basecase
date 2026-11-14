import type { DroppedFile } from './worldTypes';
import { boxAround, boxOf, type Box } from './worldFrame';
import { accessorBounds, accessorCount, readIndices, readPositions, type AccessorSource } from './worldGltfAccessor';
import { gltfBuffers, gltfFileNames, readGltfDoc } from './worldGltfFile';
import { meshInstances, transformPoint, type Mat4, type MeshInstance } from './worldGltfNodes';
import {
  concatenated,
  damaged,
  listOf,
  MAX_WORLD_TRIANGLES,
  MAX_WORLD_VERTICES,
  recordOf,
  tooManyTriangles,
  wholeOr,
  withCommas,
  worldRefuse,
  type RawMesh,
} from './worldRead';

export interface GltfMesh extends RawMesh {
  files: string[];
}

interface Primitive {
  position: unknown;
  indices: unknown;
  mode: number;
}

interface Budget {
  vertices: number;
  triangles: number;
}

const TRIANGLES = 4;
const STRIP = 5;
const FAN = 6;
const SURFACE_MODES = [TRIANGLES, STRIP, FAN];

function primitivesOf(json: Record<string, unknown>, mesh: number, name: string): Primitive[] {
  const meshes = listOf(json.meshes, name);
  const record = recordOf(meshes[mesh] ?? damaged(name), name);

  return listOf(record.primitives, name).flatMap((value) => {
    const primitive = recordOf(value, name);
    const mode = wholeOr(primitive.mode, TRIANGLES, name);
    const position = recordOf(primitive.attributes, name).POSITION;

    return SURFACE_MODES.includes(mode) && position !== undefined
      ? [{ position, indices: primitive.indices, mode }]
      : [];
  });
}

const triangleCount = (n: number, mode: number) => (mode === TRIANGLES ? Math.floor(n / 3) : Math.max(0, n - 2));

function stripCorner(i: number, corner: number) {
  if (i % 2 === 0 || corner === 2) return i + corner;

  return i + 1 - corner;
}

const CORNERS: Record<number, (t: number, k: number) => number> = {
  [TRIANGLES]: (t, k) => t * 3 + k,
  [STRIP]: stripCorner,
  [FAN]: (t, k) => (k === 0 ? 0 : t + k),
};

function triangles(list: Uint32Array | null, n: number, mode: number): Uint32Array {
  const corner = CORNERS[mode];
  const out = new Uint32Array(triangleCount(n, mode) * 3);

  for (let t = 0; t < out.length / 3; t++) {
    for (let k = 0; k < 3; k++) out[t * 3 + k] = list ? list[corner(t, k)] : corner(t, k);
  }

  return out;
}

function spend(budget: Budget, { vertices, triangles: tris }: Budget, name: string) {
  budget.vertices += vertices;
  budget.triangles += tris;

  if (budget.vertices > MAX_WORLD_VERTICES) worldRefuse(`${name} has over ${withCommas(MAX_WORLD_VERTICES)} vertices.`);

  if (budget.triangles > MAX_WORLD_TRIANGLES) tooManyTriangles(name);
}

function bake(positions: Float32Array, matrix: Mat4) {
  for (let i = 0; i < positions.length; i += 3) {
    positions.set(transformPoint(matrix, [positions[i], positions[i + 1], positions[i + 2]]), i);
  }
}

function readPrimitive(source: AccessorSource, primitive: Primitive, matrix: Mat4, budget: Budget): RawMesh {
  const vertices = accessorCount(source, primitive.position);
  const listed = primitive.indices === undefined ? vertices : accessorCount(source, primitive.indices);

  spend(budget, { vertices, triangles: triangleCount(listed, primitive.mode) }, source.name);

  const positions = readPositions(source, primitive.position);
  const list = primitive.indices === undefined ? null : readIndices(source, primitive.indices, vertices);

  bake(positions, matrix);

  return { positions, indices: triangles(list, listed, primitive.mode) };
}

function merged(meshes: RawMesh[]): RawMesh {
  let base = 0;

  const indices = meshes.map((m) => {
    const shifted = m.indices.map((i) => i + base);

    base += m.positions.length / 3;

    return shifted;
  });

  return {
    positions: concatenated(
      meshes.map((m) => m.positions),
      (n) => new Float32Array(n),
    ),
    indices: concatenated(indices, (n) => new Uint32Array(n)),
  };
}

const primitiveInstances = (json: Record<string, unknown>, name: string) =>
  meshInstances(json, name).flatMap((instance: MeshInstance) =>
    primitivesOf(json, instance.mesh, name).map((primitive) => ({ primitive, matrix: instance.matrix })),
  );

export function readGltf(file: DroppedFile, files: DroppedFile[]): GltfMesh {
  const doc = readGltfDoc(file);
  const source: AccessorSource = { name: file.name, json: doc.json, buffers: gltfBuffers(doc, files) };
  const budget: Budget = { vertices: 0, triangles: 0 };
  const parts = primitiveInstances(doc.json, file.name).map(({ primitive, matrix }) =>
    readPrimitive(source, primitive, matrix, budget),
  );

  return { ...merged(parts), files: gltfFileNames(doc, files) };
}

export function gltfFiles(file: DroppedFile, files: DroppedFile[]): string[] {
  return gltfFileNames(readGltfDoc(file), files);
}

export function gltfBox(file: DroppedFile, files: DroppedFile[]): Box {
  const { json } = readGltfDoc(file);
  const placed = primitiveInstances(json, file.name);
  const bounds = placed.map(({ primitive }) => accessorBounds(json, primitive.position, file.name));

  if (bounds.some((b) => !b)) return boxOf(readGltf(file, files).positions);

  const corners = placed.flatMap(({ matrix }, i) => {
    const { min, max } = bounds[i]!;

    return [0, 1, 2, 3, 4, 5, 6, 7].map((c) =>
      transformPoint(matrix, [c & 1 ? max[0] : min[0], c & 2 ? max[1] : min[1], c & 4 ? max[2] : min[2]]),
    );
  });

  return boxAround(corners);
}
