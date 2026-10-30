const SPOT_CELL_MM = 5;

export function weldMesh(positions, indices) {
  const map = new Map();
  const remap = new Int32Array(positions.length / 3);
  const out = [];

  for (let v = 0; v < remap.length; v++) {
    const key = `${Math.round(positions[v * 3] * 1000)},${Math.round(positions[v * 3 + 1] * 1000)},${Math.round(positions[v * 3 + 2] * 1000)}`;
    let idx = map.get(key);

    if (idx === undefined) {
      idx = out.length / 3;
      out.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
      map.set(key, idx);
    }

    remap[v] = idx;
  }

  const tris = [];

  for (let t = 0; t < indices.length; t += 3) {
    const a = remap[indices[t]];
    const b = remap[indices[t + 1]];
    const c = remap[indices[t + 2]];

    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }

  return { positions: Float64Array.from(out), indices: Uint32Array.from(tris) };
}

export function edgeFaces(mesh) {
  const n = mesh.positions.length / 3;
  const edges = new Map();
  const { indices } = mesh;

  for (let t = 0; t < indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[t + k];
      const b = indices[t + ((k + 1) % 3)];
      const key = a < b ? a * n + b : b * n + a;
      const list = edges.get(key);

      if (list) list.push(t / 3);
      else edges.set(key, [t / 3]);
    }
  }

  return edges;
}

function find(parent, i) {
  let root = i;

  while (parent[root] !== root) root = parent[root];

  while (parent[i] !== root) {
    const next = parent[i];

    parent[i] = root;
    i = next;
  }

  return root;
}

function countBodies(mesh) {
  const n = mesh.positions.length / 3;
  const parent = new Int32Array(n).map((_, i) => i);
  const used = new Uint8Array(n);
  const { indices } = mesh;

  for (let t = 0; t < indices.length; t += 3) {
    const a = find(parent, indices[t]);

    used[indices[t]] = used[indices[t + 1]] = used[indices[t + 2]] = 1;
    parent[find(parent, indices[t + 1])] = a;
    parent[find(parent, indices[t + 2])] = a;
  }

  let usedCount = 0;

  for (let i = 0; i < n; i++) if (used[i]) usedCount++;

  const volumes = shellVolumes(mesh, parent);
  const voids = [...volumes.values()].filter((v) => v < 0).length;

  return { surfaces: volumes.size, bodies: volumes.size - voids, voids, usedVertices: usedCount };
}

function triangleVolume(p, a, b, c) {
  const [ax, ay, az] = [p[a * 3], p[a * 3 + 1], p[a * 3 + 2]];
  const [bx, by, bz] = [p[b * 3], p[b * 3 + 1], p[b * 3 + 2]];
  const [cx, cy, cz] = [p[c * 3], p[c * 3 + 1], p[c * 3 + 2]];

  return (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
}

function shellVolumes(mesh, parent) {
  const volumes = new Map();
  const { indices, positions } = mesh;

  for (let t = 0; t < indices.length; t += 3) {
    const root = find(parent, indices[t]);

    volumes.set(root, (volumes.get(root) ?? 0) + triangleVolume(positions, indices[t], indices[t + 1], indices[t + 2]));
  }

  return volumes;
}

const round1 = (v) => Math.round(v * 10) / 10;

function spotsOf(mesh, badEdges) {
  const n = mesh.positions.length / 3;
  const cells = new Map();
  const p = mesh.positions;

  for (const key of badEdges) {
    const a = Math.floor(key / n);
    const b = key - a * n;
    const mid = [0, 1, 2].map((k) => (p[a * 3 + k] + p[b * 3 + k]) / 2);
    const cell = mid.map((v) => Math.floor(v / SPOT_CELL_MM)).join(',');
    const acc = cells.get(cell) ?? { count: 0, sum: [0, 0, 0] };

    acc.count++;
    mid.forEach((v, k) => (acc.sum[k] += v));
    cells.set(cell, acc);
  }

  return [...cells.values()]
    .sort((x, y) => y.count - x.count)
    .slice(0, 3)
    .map((c) => ({ at: c.sum.map((v) => round1(v / c.count)), edges: c.count }));
}

export function topology(mesh) {
  const edges = edgeFaces(mesh);
  const byFaces = {};
  const bad = [];
  let open = 0;

  for (const [key, faces] of edges) {
    if (faces.length === 2) continue;

    byFaces[faces.length] = (byFaces[faces.length] ?? 0) + 1;

    if (faces.length === 1) open++;
    else bad.push(key);
  }

  const { surfaces, bodies, voids, usedVertices } = countBodies(mesh);
  const chi = usedVertices - edges.size + mesh.indices.length / 3;
  const closed = bad.length === 0 && open === 0;

  return {
    bodies,
    voids,
    genus: closed ? Math.max(0, surfaces - chi / 2) : null,
    nonManifoldEdges: bad.length,
    openEdges: open,
    edgesByFaces: byFaces,
    spots: spotsOf(mesh, bad),
    edges,
  };
}
