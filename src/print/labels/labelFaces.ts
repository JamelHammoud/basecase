import type { MeshData } from '../threeMf';

export type V3 = [number, number, number];

export interface FlatFace {
  normal: V3;
  offset: number;
  area: number;
  u: V3;
  v: V3;
  tris: Float32Array;
  edges: Float32Array;
  centroid: [number, number];
}

const NORMAL_STEPS = 400;
const OFFSET_STEPS = 50;

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const scaled = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

const unit = (a: V3): V3 => scaled(a, 1 / (Math.hypot(...a) || 1));

function vertex(mesh: MeshData, i: number): V3 {
  return [mesh.vertices[i * 3], mesh.vertices[i * 3 + 1], mesh.vertices[i * 3 + 2]];
}

function triangleNormal(mesh: MeshData, t: number): { normal: V3; area: number } {
  const [a, b, c] = [0, 1, 2].map((k) => vertex(mesh, mesh.indices[t * 3 + k]));
  const n = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
  const length = Math.hypot(...n);

  return { normal: length ? scaled(n, 1 / length) : [0, 0, 0], area: length / 2 };
}

function planeBuckets(mesh: MeshData): Map<string, number[]> {
  const buckets = new Map<string, number[]>();

  for (let t = 0; t < mesh.indices.length / 3; t++) {
    const { normal, area } = triangleNormal(mesh, t);

    if (area < 1e-6) continue;

    const offset = dot(normal, vertex(mesh, mesh.indices[t * 3]));
    const key = [...normal.map((x) => Math.round(x * NORMAL_STEPS)), Math.round(offset * OFFSET_STEPS)].join(',');
    const list = buckets.get(key);

    if (list) list.push(t);
    else buckets.set(key, [t]);
  }

  return buckets;
}

function components(mesh: MeshData, tris: number[]): number[][] {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let root = x;

    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;

    parent.set(x, root);

    return root;
  };
  const union = (a: number, b: number) => {
    const [ra, rb] = [find(a), find(b)];

    if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb));
  };

  for (const t of tris) {
    union(mesh.indices[t * 3], mesh.indices[t * 3 + 1]);
    union(mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]);
  }

  const groups = new Map<number, number[]>();

  for (const t of tris) {
    const root = find(mesh.indices[t * 3]);

    groups.set(root, [...(groups.get(root) ?? []), t]);
  }

  return [...groups.values()];
}

export function planeAxes(normal: V3): { u: V3; v: V3 } {
  const axes: V3[] = [
    [0, 1, 0],
    [0, 0, 1],
  ];
  const reference = axes.reduce(
    (best, a) => (Math.abs(dot(a, normal)) < Math.abs(dot(best, normal)) - 1e-9 ? a : best),
    [1, 0, 0],
  );
  const u = unit(reference.map((x, i) => x - dot(reference, normal) * normal[i]) as V3);

  return { u, v: cross(normal, u) };
}

function boundaryEdges(mesh: MeshData, tris: number[]): Array<[number, number]> {
  const count = new Map<string, [number, number, number]>();

  for (const t of tris)
    for (let k = 0; k < 3; k++) {
      const a = mesh.indices[t * 3 + k];
      const b = mesh.indices[t * 3 + ((k + 1) % 3)];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const known = count.get(key);

      count.set(key, known ? [known[0], known[1], known[2] + 1] : [a, b, 1]);
    }

  return [...count.values()].filter((e) => e[2] === 1).map(([a, b]) => [a, b]);
}

function faceOf(mesh: MeshData, tris: number[]): FlatFace {
  let area = 0;
  const sum: V3 = [0, 0, 0];
  const center: V3 = [0, 0, 0];

  for (const t of tris) {
    const { normal, area: a } = triangleNormal(mesh, t);
    const [p, q, r] = [0, 1, 2].map((k) => vertex(mesh, mesh.indices[t * 3 + k]));

    area += a;

    for (let k = 0; k < 3; k++) {
      sum[k] += normal[k] * a;
      center[k] += ((p[k] + q[k] + r[k]) / 3) * a;
    }
  }

  const normal = unit(sum);
  const { u, v } = planeAxes(normal);
  const flat = (i: number) => {
    const p = vertex(mesh, i);

    return [dot(p, u), dot(p, v)];
  };
  const centroid3 = scaled(center, 1 / (area || 1));

  return {
    normal,
    offset: dot(normal, centroid3),
    area,
    u,
    v,
    tris: Float32Array.from(tris.flatMap((t) => [0, 1, 2].flatMap((k) => flat(mesh.indices[t * 3 + k])))),
    edges: Float32Array.from(boundaryEdges(mesh, tris).flatMap(([a, b]) => [...flat(a), ...flat(b)])),
    centroid: [dot(centroid3, u), dot(centroid3, v)],
  };
}

const faceOrder = (a: FlatFace, b: FlatFace) =>
  b.area - a.area || b.normal[1] - a.normal[1] || b.normal[2] - a.normal[2] || b.normal[0] - a.normal[0];

export function flatFaces(mesh: MeshData, minArea: number): FlatFace[] {
  const faces: FlatFace[] = [];

  for (const tris of planeBuckets(mesh).values()) {
    const total = tris.reduce((s, t) => s + triangleNormal(mesh, t).area, 0);

    if (total < minArea) continue;

    for (const group of components(mesh, tris)) {
      const face = faceOf(mesh, group);

      if (face.area >= minArea) faces.push(face);
    }
  }

  return faces.sort(faceOrder);
}
