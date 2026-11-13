import { MeshoptSimplifier } from 'meshoptimizer';
import { UNREADABLE_ERROR, sourceBytes } from './convertCore.mjs';
import { compact, displayColor, weld } from './partGlb.mjs';
import { BODY_TRIANGLE_BUDGET, MAX_BODIES } from './bodiesPolicy.mjs';
import { addMesh, readOcct, rotationMatrix, triangleCollector } from './stepCore.mjs';

const SIMPLIFY_ERROR = 0.0015;
const MIN_TRIANGLES = 4;

function namesByMesh(node, inherited = '', names = new Map()) {
  const name = node?.name || inherited;

  for (const index of node?.meshes ?? []) if (!names.has(index)) names.set(index, name);

  for (const child of node?.children ?? []) namesByMesh(child, name, names);

  return names;
}

const hexOf = (color) =>
  `#${color
    .slice(0, 3)
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

function soupOf(mesh) {
  const { groups, addTriangle } = triangleCollector(rotationMatrix([]));

  addMesh(mesh, { src: {}, addTriangle });

  const all = [...groups.values()];
  const main = all.reduce((a, b) => (b.soup.length > a.soup.length ? b : a), all[0]);

  return { soup: all.flatMap((g) => g.soup), color: main ? displayColor(main.color) : null };
}

function bounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }

  return { center: min.map((v, k) => (v + max[k]) / 2), size: max.map((v, k) => v - min[k]) };
}

function centred(body) {
  const { center, size } = bounds(body.positions);

  for (let i = 0; i < body.positions.length; i++) body.positions[i] -= center[i % 3];

  return { ...body, center, size };
}

function simplified(body, ratio) {
  if (ratio >= 1) return body;

  const target = Math.max(MIN_TRIANGLES * 3, Math.floor((body.indices.length * ratio) / 3) * 3);
  const [out] = MeshoptSimplifier.simplify(body.indices, body.positions, 3, target, SIMPLIFY_ERROR, ['LockBorder']);

  return { ...body, ...compact(out, body.positions) };
}

function packBodies(bodies) {
  const bytes = bodies.reduce((n, b) => n + b.positions.byteLength + b.indices.byteLength, 0);
  const out = new Uint8Array(bytes);
  let at = 0;

  for (const b of bodies)
    for (const typed of [b.positions, b.indices]) {
      out.set(new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength), at);
      at += typed.byteLength;
    }

  return out;
}

export function convertBodies(occt, job) {
  const { content, ext } = sourceBytes(job);
  const result = readOcct(occt, { content, ext, src: {} });

  if (!result?.meshes?.length) throw new Error(UNREADABLE_ERROR);

  if (result.meshes.length > MAX_BODIES) throw new Error(`The file has more than ${MAX_BODIES} bodies.`);

  const names = namesByMesh(result.root);
  const welded = result.meshes
    .map((mesh, i) => {
      const { soup, color } = soupOf(mesh);

      return { name: mesh.name || names.get(i) || '', color, ...weld(soup) };
    })
    .filter((b) => b.indices.length > 0);

  if (!welded.length) throw new Error(UNREADABLE_ERROR);

  const triangles = welded.reduce((n, b) => n + b.indices.length / 3, 0);
  const ratio = BODY_TRIANGLE_BUDGET / triangles;
  const bodies = welded
    .map((b) => simplified(b, ratio))
    .filter((b) => b.indices.length > 0)
    .map(centred);

  return {
    bin: packBodies(bodies),
    header: {
      ok: true,
      bodies: bodies.map((b) => ({
        name: b.name.slice(0, 200),
        color: hexOf(b.color ?? [0.6, 0.6, 0.62]),
        center: b.center,
        size: b.size,
        vertices: b.positions.length / 3,
        triangles: b.indices.length / 3,
      })),
    },
  };
}
