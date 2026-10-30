const DEG = Math.PI / 180;

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const toScene = ([x, y, z]) => [x, z, -y];

export function eulerMatrix([rx, ry, rz]) {
  const [a, b, c] = [rx * DEG, ry * DEG, rz * DEG];
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)];

  return [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
}

export const mulVec = (m, v) => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
export const mulVecT = (m, v) => [
  m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
  m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
  m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
];

export function frameOf(part) {
  const m = eulerMatrix(part.rotation ?? [0, 0, 0]);

  return {
    m,
    toWorld: (local) => add(part.position, mulVec(m, local)),
    toLocal: (world) => mulVecT(m, sub(world, part.position)),
    axis: (local) => mulVec(m, local),
  };
}

function boxMesh([w, h, d]) {
  const [x, y, z] = [w / 2, h / 2, d / 2];
  const positions = [-x, -y, -z, x, -y, -z, x, y, -z, -x, y, -z, -x, -y, z, x, -y, z, x, y, z, -x, y, z];
  const indices = [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3,
  ];

  return { positions, indices };
}

const PRIMITIVE_BOXES = new Set(['box', 'plate', 'block']);

export function localMesh(part) {
  if (part.cad?.positions?.length) return { positions: part.cad.positions, indices: part.cad.indices };

  if (part.mesh?.positions?.length) return { positions: part.mesh.positions, indices: part.mesh.indices };

  if (PRIMITIVE_BOXES.has(part.kind)) {
    const { width, height, depth } = part.dimensions;

    return boxMesh([width, height, depth]);
  }

  return null;
}

function meshBounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }

  return { min, max };
}

const RAY = [0.431, 0.574, 0.696].map((v) => v / Math.hypot(0.431, 0.574, 0.696));

function vertex(positions, i) {
  return [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];
}

function rayHitsTriangle(o, [a, b, c]) {
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const p = cross(RAY, e2);
  const det = dot(e1, p);

  if (Math.abs(det) < 1e-12) return false;

  const t0 = sub(o, a);
  const u = dot(t0, p) / det;
  const q = cross(t0, e1);
  const v = dot(RAY, q) / det;

  return u >= 0 && v >= 0 && u + v <= 1 && dot(e2, q) / det > 0;
}

const inside = (b, p, pad = 0) => p.every((v, k) => v >= b.min[k] - pad && v <= b.max[k] + pad);

export function solidOf(part) {
  const mesh = localMesh(part);

  if (!mesh) return null;

  const bounds = meshBounds(mesh.positions);
  const tris = [];

  for (let i = 0; i < mesh.indices.length; i += 3)
    tris.push([0, 1, 2].map((j) => vertex(mesh.positions, mesh.indices[i + j])));

  const frame = frameOf(part);

  return {
    id: part.id,
    bounds,
    contains(world) {
      const p = frame.toLocal(world);

      if (!inside(bounds, p)) return false;

      let hits = 0;

      for (const t of tris) hits += rayHitsTriangle(p, t) ? 1 : 0;

      return hits % 2 === 1;
    },
  };
}

export function meshStats(part) {
  const mesh = localMesh(part);

  if (!mesh) return null;

  const frame = frameOf(part);
  let volume = 0;
  let centroid = [0, 0, 0];

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map((j) => frame.toWorld(vertex(mesh.positions, mesh.indices[i + j])));
    const v = dot(a, cross(b, c)) / 6;

    volume += v;
    centroid = add(centroid, scale(add(add(a, b), c), v / 4));
  }

  const { min, max } = meshBounds(mesh.positions);

  return {
    volume: Math.abs(volume),
    centroid: volume ? scale(centroid, 1 / volume) : part.position,
    size: max.map((v, k) => v - min[k]),
  };
}

export function boxContains(part, world, pad = 0) {
  const p = frameOf(part).toLocal(world);
  const half = [part.dimensions.width / 2, part.dimensions.height / 2, part.dimensions.depth / 2];

  return p.every((v, k) => Math.abs(v) <= half[k] + pad);
}

export function perpendiculars(axis) {
  const helper = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = cross(axis, helper);
  const nu = scale(u, 1 / len(u));

  return [nu, cross(axis, nu)];
}
