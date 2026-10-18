import * as THREE from 'three';

const CREASE_DEG = 20;

const pointKey = (x: number, y: number, z: number) =>
  `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`;

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function faceNormalsByEdge(positions: number[], indices: number[]): Map<string, THREE.Vector3[]> {
  const vertexKey = (i: number) => pointKey(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  const normals = new Map<string, THREE.Vector3[]>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  for (let t = 0; t + 2 < indices.length; t += 3) {
    const corners = [indices[t], indices[t + 1], indices[t + 2]];

    a.fromArray(positions, corners[0] * 3);
    b.fromArray(positions, corners[1] * 3);
    c.fromArray(positions, corners[2] * 3);

    const normal = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());

    for (let k = 0; k < 3; k++) {
      const key = edgeKey(vertexKey(corners[k]), vertexKey(corners[(k + 1) % 3]));
      const list = normals.get(key);

      if (list) list.push(normal);
      else normals.set(key, [normal]);
    }
  }

  return normals;
}

export function creaseEdgesOnly(edges: number[], positions: number[], indices: number[]): number[] {
  const normals = faceNormalsByEdge(positions, indices);
  const cosLimit = Math.cos(THREE.MathUtils.degToRad(CREASE_DEG));
  const out: number[] = [];

  for (let i = 0; i + 5 < edges.length; i += 6) {
    const key = edgeKey(
      pointKey(edges[i], edges[i + 1], edges[i + 2]),
      pointKey(edges[i + 3], edges[i + 4], edges[i + 5]),
    );
    const list = normals.get(key);
    const smooth = list?.length === 2 && list[0].dot(list[1]) > cosLimit;

    if (!smooth) out.push(...edges.slice(i, i + 6));
  }

  return out;
}
