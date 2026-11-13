import { MeshoptSimplifier } from 'meshoptimizer';
import { concatBytes, packGlb } from '../cadImport/meshopt.mjs';
import { compact } from '../cadImport/partGlb.mjs';

await MeshoptSimplifier.ready;

const SIMPLIFY_ERROR = 0.002;
const MIN_TRIANGLES = 12;

function bodyArrays({ bodies, data }) {
  let at = 0;

  return bodies.map((body) => {
    const positionBytes = body.vertices * 12;
    const positions = new Float32Array(data.slice(at, at + positionBytes).buffer);
    const indices = new Uint32Array(data.slice(at + positionBytes, at + positionBytes + body.triangles * 12).buffer);

    at += positionBytes + body.triangles * 12;

    for (let i = 0; i < positions.length; i++) positions[i] += body.center[i % 3];

    return { positions, indices, color: body.color };
  });
}

function simplified(body, ratio) {
  if (ratio >= 1) return body;

  const target = Math.max(MIN_TRIANGLES * 3, Math.floor((body.indices.length * ratio) / 3) * 3);
  const [indices] = MeshoptSimplifier.simplify(body.indices, body.positions, 3, target, SIMPLIFY_ERROR, ['LockBorder']);

  return { ...body, ...compact(indices, body.positions) };
}

function bounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }

  return { min, max };
}

const bytesOf = (typed) => new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);

function glbOf(bodies) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let offset = 0;

  for (const b of bodies)
    for (const [typed, target] of [
      [b.positions, 34962],
      [b.indices, 34963],
    ]) {
      bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: typed.byteLength, target });
      chunks.push(bytesOf(typed));
      offset += typed.byteLength;
    }

  const primitives = bodies.map((b, i) => {
    accessors.push(
      { bufferView: i * 2, componentType: 5126, count: b.positions.length / 3, type: 'VEC3', ...bounds(b.positions) },
      { bufferView: i * 2 + 1, componentType: 5125, count: b.indices.length, type: 'SCALAR' },
    );

    return { attributes: { POSITION: i * 2 }, indices: i * 2 + 1 };
  });
  const bin = concatBytes(chunks);
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  return packGlb(json, bin);
}

export function partMesh(opened, maxTriangles) {
  const bodies = bodyArrays(opened);
  const triangles = bodies.reduce((n, b) => n + b.indices.length / 3, 0);
  const kept = bodies.map((b) => simplified(b, maxTriangles / triangles)).filter((b) => b.indices.length > 0);
  const biggest = kept.reduce((a, b) => (b.indices.length > a.indices.length ? b : a), kept[0]);

  return { glb: glbOf(kept), color: biggest?.color ?? null };
}
