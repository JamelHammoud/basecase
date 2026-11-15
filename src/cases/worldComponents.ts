import { CaseFileError } from './validate';

export interface CollisionMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

function root(parents: Uint32Array, index: number): number {
  let current = index;

  while (parents[current] !== current) {
    parents[current] = parents[parents[current]];
    current = parents[current];
  }

  return current;
}

function vertexRoots(positions: Float32Array): Uint32Array {
  const parents = new Uint32Array(positions.length / 3);
  const seen = new Map<string, number>();

  for (let i = 0; i < parents.length; i++) {
    const key = `${positions[i * 3]},${positions[i * 3 + 1]},${positions[i * 3 + 2]}`;
    const duplicate = seen.get(key);

    parents[i] = duplicate ?? i;
    seen.set(key, duplicate ?? i);
  }

  return parents;
}

function checkedMesh(mesh: CollisionMesh): void {
  const { positions, indices } = mesh;

  if (positions.length < 9 || positions.length % 3 || indices.length < 3 || indices.length % 3) {
    throw new CaseFileError('World mesh needs complete triangles.');
  }

  if (indices.length > 600_000 || positions.length > 1_800_000) {
    throw new CaseFileError('World mesh exceeds 200,000 triangles.');
  }

  if (
    positions.some((value) => !Number.isFinite(value) || Math.abs(value) > 500_000) ||
    indices.some((value) => value >= positions.length / 3)
  ) {
    throw new CaseFileError('World mesh needs finite positions and matching triangle indices.');
  }
}

function compact(mesh: CollisionMesh, triangles: number[]): CollisionMesh {
  const remap = new Map<string, number>();
  const positions: number[] = [];
  const indices = new Uint32Array(triangles.length);

  for (let i = 0; i < triangles.length; i++) {
    const vertex = triangles[i];
    const key = `${mesh.positions[vertex * 3]},${mesh.positions[vertex * 3 + 1]},${mesh.positions[vertex * 3 + 2]}`;
    const prior = remap.get(key);

    if (prior !== undefined) {
      indices[i] = prior;

      continue;
    }

    const next = positions.length / 3;

    positions.push(mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 1], mesh.positions[vertex * 3 + 2]);
    remap.set(key, next);
    indices[i] = next;
  }

  return { positions: new Float32Array(positions), indices };
}

export function worldComponents(mesh: CollisionMesh, limit: number): CollisionMesh[] {
  checkedMesh(mesh);

  const parents = vertexRoots(mesh.positions);

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const first = root(parents, mesh.indices[i]);

    parents[root(parents, mesh.indices[i + 1])] = first;
    parents[root(parents, mesh.indices[i + 2])] = first;
  }

  const components = new Map<number, number[]>();

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const key = root(parents, mesh.indices[i]);
    const triangles = components.get(key) ?? [];

    triangles.push(mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]);
    components.set(key, triangles);
  }

  if (components.size > limit) throw new CaseFileError(`World mesh exceeds ${limit} disconnected collision surfaces.`);

  return [...components.values()].map((triangles) => compact(mesh, triangles));
}
