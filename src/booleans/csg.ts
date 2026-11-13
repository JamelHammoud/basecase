import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BooleanOp } from '../types/robotics';
import { manifoldCsg } from './manifoldCsg';
import { bvhCsg } from './bvhCsg';
import type { Vec3 } from './parts';

export interface OperandPiece {
  positions: Float32Array;
  indices: Uint32Array | null;
  matrix: number[];
}

export interface BooleanJob {
  op: BooleanOp;
  operands: OperandPiece[][];
  origin: Vec3;
  rotation: Vec3;
}

export interface WeldedMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface CsgOutput {
  positions: Float64Array;
  indices: Uint32Array;
  offset: Vec3;
  size: Vec3;
  engine: 'manifold' | 'bvh';
}

const MIN_SIZE = 0.5;

function worldSoup(pieces: OperandPiece[]): Float32Array {
  const chunks = pieces.map((piece) => {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.BufferAttribute(piece.positions, 3));

    if (piece.indices) geometry.setIndex(new THREE.BufferAttribute(piece.indices, 1));

    const flat = piece.indices ? geometry.toNonIndexed() : geometry;

    flat.applyMatrix4(new THREE.Matrix4().fromArray(piece.matrix));

    return flat.getAttribute('position').array as Float32Array;
  });
  const soup = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;

  for (const chunk of chunks) {
    soup.set(chunk, offset);
    offset += chunk.length;
  }

  return soup;
}

export function weldOperand(pieces: OperandPiece[]): WeldedMesh {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.BufferAttribute(worldSoup(pieces), 3));

  const welded = mergeVertices(geometry, 1e-4);

  return {
    positions: welded.getAttribute('position').array as Float32Array,
    indices: new Uint32Array(welded.index!.array as ArrayLike<number>),
  };
}

const round = (v: number) => Math.round(v * 1e4) / 1e4 + 0;

function toFrame(mesh: WeldedMesh, origin: Vec3, rotation: Vec3) {
  const inverse = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(...(rotation.map((d) => THREE.MathUtils.degToRad(d)) as Vec3), 'XYZ'))
    .invert();
  const local = new THREE.BufferAttribute(Float32Array.from(mesh.positions), 3);
  const shift = new THREE.Vector3(...origin).negate();

  local
    .applyMatrix4(new THREE.Matrix4().makeTranslation(shift))
    .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(inverse));

  const box = new THREE.Box3().setFromBufferAttribute(local);

  return { local, box, rotation: inverse.invert() };
}

function framed(mesh: WeldedMesh, job: BooleanJob) {
  const { local, box, rotation } = toFrame(mesh, job.origin, job.rotation);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).toArray().map(round) as Vec3;
  const positions = new Float64Array(local.count * 3);

  for (let i = 0; i < local.count; i++) {
    positions[i * 3] = round(local.getX(i) - center.x);
    positions[i * 3 + 1] = round(local.getY(i) - center.y);
    positions[i * 3 + 2] = round(local.getZ(i) - center.z);
  }

  const offset = center.applyQuaternion(rotation).toArray().map(round) as Vec3;

  return { positions, indices: mesh.indices, offset, size };
}

export async function evaluateBooleanJob(job: BooleanJob): Promise<CsgOutput | null> {
  const operands = job.operands.map(weldOperand).filter((m) => m.indices.length >= 12);

  if (operands.length < 2) return null;

  const viaManifold = await manifoldCsg(job.op, operands);
  const result = viaManifold ?? bvhCsg(job.op, operands);

  if (!result || result.indices.length < 12) return null;

  const out = framed(result, job);

  if (out.size.some((s) => s < MIN_SIZE)) return null;

  return { ...out, engine: viaManifold ? 'manifold' : 'bvh' };
}
