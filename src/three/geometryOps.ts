import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { reply } from '../utils/workerRpc';
import { loadMesh } from '../utils/robotImport/meshes';
import { componentArrays, componentTransfers } from './componentGeometry';
import { creasedGeometry } from './partMesh/creased';
import { creaseEdgesOnly } from './partMesh/creaseEdges';

type Vec3 = [number, number, number];

export interface LinkMeshJob {
  soup: Float32Array;
  target: number;
}

export interface LinkMesh {
  positions: number[];
  indices: number[];
  center: Vec3;
  size: Vec3;
}

export interface CreaseEdgesJob {
  edges: number[];
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}

export interface CreasedJob {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
  creaseDeg: number;
  scale: number[];
}

export interface SoupPiece {
  positions: Float32Array;
  matrix: number[];
}

export interface LinkSoup {
  soup: Float32Array;
  min: Vec3;
  max: Vec3;
}

export interface EdgesJob {
  positions: Float32Array;
  thresholdDeg: number;
}

const MIN_INDICES = 36;

function weld(soup: Float32Array) {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.BufferAttribute(soup, 3));

  const welded = mergeVertices(geometry, 1e-3);

  return {
    positions: (welded.getAttribute('position').array as Float32Array).slice(),
    indices: new Uint32Array(welded.index!.array as ArrayLike<number>),
  };
}

export async function simplifyMesh(soup: Float32Array, target: number) {
  const { positions, indices } = weld(soup);

  await MeshoptSimplifier.ready.catch(() => {});

  if (indices.length / 3 <= target || !MeshoptSimplifier.supported) return { positions, indices };

  const [out] = MeshoptSimplifier.simplify(indices, positions, 3, Math.max(target * 3, MIN_INDICES), 0.002, ['Prune']);

  return { positions, indices: out.length >= MIN_INDICES ? (out as Uint32Array) : indices };
}

function bounds(positions: Float32Array) {
  const box = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(positions, 3));

  return { center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) };
}

const centi = (v: number) => Math.round(v * 100) / 100;

function compactMesh(positions: Float32Array, indices: Uint32Array, center: THREE.Vector3) {
  const used = new Int32Array(positions.length / 3).fill(-1);
  const pos: number[] = [];
  const idx: number[] = [];

  for (const i of indices) {
    if (used[i] < 0) {
      used[i] = pos.length / 3;
      pos.push(
        centi(positions[i * 3] - center.x),
        centi(positions[i * 3 + 1] - center.y),
        centi(positions[i * 3 + 2] - center.z),
      );
    }

    idx.push(used[i]);
  }

  return { pos, idx };
}

export async function linkMesh({ soup, target }: LinkMeshJob): Promise<LinkMesh> {
  const { positions, indices } = await simplifyMesh(soup, target);
  const { center, size } = bounds(positions);
  const { pos, idx } = compactMesh(positions, indices, center);

  return { positions: pos, indices: idx, center: center.toArray(), size: size.toArray() };
}

export function linkSoup(pieces: SoupPiece[]): LinkSoup {
  const soup = new Float32Array(pieces.reduce((sum, p) => sum + p.positions.length, 0));
  const matrix = new THREE.Matrix4();
  const attribute = new THREE.BufferAttribute(soup, 3);
  let offset = 0;

  for (const piece of pieces) {
    const part = new THREE.BufferAttribute(piece.positions, 3).applyMatrix4(matrix.fromArray(piece.matrix));

    soup.set(part.array as Float32Array, offset);
    offset += piece.positions.length;
  }

  const box = new THREE.Box3().setFromBufferAttribute(attribute);

  return { soup, min: box.min.toArray(), max: box.max.toArray() };
}

export function edgeLines({ positions, thresholdDeg }: EdgesJob): Float32Array {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  return new THREE.EdgesGeometry(geometry, thresholdDeg).getAttribute('position').array as Float32Array;
}

const ownBuffer = (array: Float32Array) =>
  array.byteOffset === 0 && array.byteLength === array.buffer.byteLength ? array : array.slice();

export interface ParseMeshJob {
  data: ArrayBuffer;
  path: string;
}

async function parseMesh({ data, path }: ParseMeshJob): Promise<Float32Array | null> {
  const geometry = await loadMesh(data, path);

  return geometry ? ownBuffer(geometry.getAttribute('position').array as Float32Array) : null;
}

const transferLines = (lines: Float32Array) => reply(lines, [lines.buffer]);

export const geometryHandlers = {
  linkMesh: async (job: LinkMeshJob) => reply(await linkMesh(job)),
  linkSoup: (pieces: SoupPiece[]) => {
    const result = linkSoup(pieces);

    return reply(result, [result.soup.buffer]);
  },
  edges: (job: EdgesJob) => transferLines(edgeLines(job)),
  creased: (job: CreasedJob) => {
    const geometry = creasedGeometry(job, job.creaseDeg, job.scale);
    const position = geometry.getAttribute('position').array as Float32Array;
    const normal = geometry.getAttribute('normal').array as Float32Array;

    return reply({ position, normal }, [position.buffer, normal.buffer]);
  },
  component: async (data: ArrayBuffer) => {
    const arrays = await componentArrays(data);

    return reply(arrays, componentTransfers(arrays));
  },
  parseMesh: async (job: ParseMeshJob) => {
    const positions = await parseMesh(job);

    return reply(positions, positions ? [positions.buffer] : []);
  },
  creaseEdges: (job: CreaseEdgesJob) =>
    transferLines(new Float32Array(creaseEdgesOnly(job.edges, job.positions as number[], job.indices as number[]))),
};
