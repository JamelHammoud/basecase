const WELD_STEP = 1e-3;
const MIN_AREA = 1e-12;
const SMOOTH_COS = Math.cos((50 * Math.PI) / 180);
const CURVED_COS = Math.cos(1e-4);

export interface TriangleMesh {
  triCount: number;
  corners: Int32Array;
  positions: Float64Array;
  normals: Float64Array;
  areas: Float64Array;
  neighborStart: Int32Array;
  neighbors: Int32Array;
  edgeA: Int32Array;
  edgeB: Int32Array;
}

export interface Region {
  tris: number[];
  label: number;
  labels: Int32Array;
}

interface Welded {
  corners: Int32Array;
  positions: Float64Array;
  count: number;
}

const hashOf = (x: number, y: number, z: number) =>
  Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);

function weld(soup: ArrayLike<number>, cornerCount: number): Welded {
  const corners = new Int32Array(cornerCount);
  const positions = new Float64Array(cornerCount * 3);
  const quantised = new Float64Array(cornerCount * 3);
  const chain = new Int32Array(cornerCount);
  const heads = new Map<number, number>();
  const quantise = (i: number) => Math.round(soup[i] / WELD_STEP);
  let count = 0;

  for (let c = 0; c < cornerCount; c++) {
    const [qx, qy, qz] = [quantise(c * 3), quantise(c * 3 + 1), quantise(c * 3 + 2)];
    const hash = hashOf(qx, qy, qz);
    const head = heads.get(hash) ?? -1;
    let v = head;

    while (v >= 0 && (quantised[v * 3] !== qx || quantised[v * 3 + 1] !== qy || quantised[v * 3 + 2] !== qz)) {
      v = chain[v];
    }

    if (v < 0) {
      v = count++;

      for (let k = 0; k < 3; k++) positions[v * 3 + k] = soup[c * 3 + k];

      quantised[v * 3] = qx;
      quantised[v * 3 + 1] = qy;
      quantised[v * 3 + 2] = qz;
      chain[v] = head;
      heads.set(hash, v);
    }

    corners[c] = v;
  }

  return { corners, positions: positions.slice(0, count * 3), count };
}

function faceNormals(welded: Welded, triCount: number): { normals: Float64Array; areas: Float64Array } {
  const { corners, positions: p } = welded;
  const normals = new Float64Array(triCount * 3);
  const areas = new Float64Array(triCount);

  for (let t = 0; t < triCount; t++) {
    const [a, b, c] = [corners[t * 3] * 3, corners[t * 3 + 1] * 3, corners[t * 3 + 2] * 3];
    const [ux, uy, uz] = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const [vx, vy, vz] = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(n[0], n[1], n[2]);

    areas[t] = length / 2;

    if (areas[t] > MIN_AREA) normals.set([n[0] / length, n[1] / length, n[2] / length], t * 3);
  }

  return { normals, areas };
}

function edgePairs(welded: Welded, areas: Float64Array): number[] {
  const owners = new Map<number, number>();
  const pairs: number[] = [];

  for (let t = 0; t < areas.length; t++) {
    if (areas[t] <= MIN_AREA) continue;

    for (let k = 0; k < 3; k++) {
      const a = welded.corners[t * 3 + k];
      const b = welded.corners[t * 3 + ((k + 1) % 3)];
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const key = lo * welded.count + hi;
      const owner = owners.get(key);

      if (owner === undefined) owners.set(key, t);
      else pairs.push(owner, t, lo, hi);
    }
  }

  return pairs;
}

function adjacency(pairs: number[], triCount: number) {
  const neighborStart = new Int32Array(triCount + 1);

  for (let i = 0; i < pairs.length; i += 4) {
    neighborStart[pairs[i] + 1]++;
    neighborStart[pairs[i + 1] + 1]++;
  }

  for (let t = 0; t < triCount; t++) neighborStart[t + 1] += neighborStart[t];

  const fill = neighborStart.slice(0, triCount);
  const neighbors = new Int32Array(neighborStart[triCount]);
  const edgeA = new Int32Array(neighbors.length);
  const edgeB = new Int32Array(neighbors.length);
  const link = (from: number, to: number, i: number) => {
    const slot = fill[from]++;

    neighbors[slot] = to;
    edgeA[slot] = pairs[i + 2];
    edgeB[slot] = pairs[i + 3];
  };

  for (let i = 0; i < pairs.length; i += 4) {
    link(pairs[i], pairs[i + 1], i);
    link(pairs[i + 1], pairs[i], i);
  }

  return { neighborStart, neighbors, edgeA, edgeB };
}

export function buildMesh(soup: ArrayLike<number>): TriangleMesh {
  const triCount = Math.floor(soup.length / 9);
  const welded = weld(soup, triCount * 3);
  const { normals, areas } = faceNormals(welded, triCount);

  return {
    triCount,
    corners: welded.corners,
    positions: welded.positions,
    normals,
    areas,
    ...adjacency(edgePairs(welded, areas), triCount),
  };
}

export const normalCos = (mesh: TriangleMesh, a: number, b: number) =>
  mesh.normals[a * 3] * mesh.normals[b * 3] +
  mesh.normals[a * 3 + 1] * mesh.normals[b * 3 + 1] +
  mesh.normals[a * 3 + 2] * mesh.normals[b * 3 + 2];

export function growRegion(mesh: TriangleMesh, seed: number, labels: Int32Array, label: number): Region {
  const tris = [seed];

  labels[seed] = label;

  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];

    for (let k = mesh.neighborStart[t]; k < mesh.neighborStart[t + 1]; k++) {
      const n = mesh.neighbors[k];

      if (labels[n] !== -1 || normalCos(mesh, t, n) < SMOOTH_COS) continue;

      labels[n] = label;
      tris.push(n);
    }
  }

  return { tris, label, labels };
}

export function smoothRegions(mesh: TriangleMesh): Region[] {
  const labels = new Int32Array(mesh.triCount).fill(-1);
  const regions: Region[] = [];

  for (let t = 0; t < mesh.triCount; t++) {
    if (labels[t] === -1 && mesh.areas[t] > MIN_AREA) regions.push(growRegion(mesh, t, labels, regions.length));
  }

  return regions;
}

function addCurvedEdges(mesh: TriangleMesh, region: Region, t: number, rim: Set<number>): boolean {
  let curved = false;

  for (let k = mesh.neighborStart[t]; k < mesh.neighborStart[t + 1]; k++) {
    const n = mesh.neighbors[k];

    if (region.labels[n] !== region.label || normalCos(mesh, t, n) > CURVED_COS) continue;

    rim.add(mesh.edgeA[k]).add(mesh.edgeB[k]);
    curved = true;
  }

  return curved;
}

export function curvedRims(mesh: TriangleMesh, region: Region, seed: number): { local: number[]; whole: number[] } {
  const whole = new Set<number>();
  const curved = new Set(region.tris.filter((t) => addCurvedEdges(mesh, region, t, whole)));
  const local = new Set<number>();
  const visited = new Set([seed]);
  const queue = [seed];

  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];

    addCurvedEdges(mesh, region, t, local);

    for (let k = mesh.neighborStart[t]; k < mesh.neighborStart[t + 1]; k++) {
      const n = mesh.neighbors[k];

      if (visited.has(n) || !curved.has(n)) continue;

      visited.add(n);
      queue.push(n);
    }
  }

  return { local: [...local], whole: [...whole] };
}

export const isValidTriangle = (mesh: TriangleMesh, t: number) => mesh.areas[t] > MIN_AREA;
