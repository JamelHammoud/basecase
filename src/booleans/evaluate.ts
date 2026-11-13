import * as THREE from 'three';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { geometryWorker } from '../three/geometryWorker';
import { packedMesh } from '../three/packedMesh';
import { meshScale, type MeshSource } from '../three/partMesh/creased';
import type { ScenePart } from '../types/robotics';
import type { CsgOutput, OperandPiece } from './csg';
import { booleanHash } from './hash';
import { baseOf, isBooleanPart, type BooleanPart, type BooleanResult, type Vec3 } from './parts';
import type { ResultLookup } from './results';

const REMEMBERED = 64;

const results = new Map<string, BooleanResult | null>();

const running = new Map<string, Promise<BooleanResult | null>>();

export const knownResult: ResultLookup = (hash) => results.get(hash);

function remember(hash: string, result: BooleanResult | null) {
  results.delete(hash);
  results.set(hash, result);

  if (results.size > REMEMBERED) results.delete(results.keys().next().value!);
}

const quaternionOf = (rotation: readonly number[]) =>
  new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...(rotation.map((d) => THREE.MathUtils.degToRad(d)) as Vec3), 'XYZ'),
  );

export function meshPiece(
  part: Pick<ScenePart, 'position' | 'rotation' | 'dimensions'>,
  src: MeshSource,
): OperandPiece {
  const { positions, indices } = packedMesh(src);
  const scale = new THREE.Vector3(...meshScale(part.dimensions, src.baseSize));
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...part.position), quaternionOf(part.rotation), scale);

  return { positions, indices, matrix: matrix.toArray() };
}

export function builtPieces(part: ScenePart): OperandPiece[] {
  const group = buildPartGroup({ ...part, visible: true }, false);
  const pieces: OperandPiece[] = [];

  group.updateMatrixWorld(true);
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;

    const index = mesh.geometry.getIndex();

    pieces.push({
      positions: Float32Array.from(mesh.geometry.getAttribute('position').array as ArrayLike<number>),
      indices: index ? Uint32Array.from(index.array as ArrayLike<number>) : null,
      matrix: mesh.matrixWorld.toArray(),
    });
  });
  releasePartGroup(group);

  return pieces;
}

export const hasMesh = (src: MeshSource | undefined): src is MeshSource => !!src && src.positions.length >= 9;

async function booleanPieces(part: BooleanPart): Promise<OperandPiece[]> {
  const result = await evaluateBoolean(part);

  if (!result) return [];

  const base = baseOf(part).position;
  const position = base.map((v, i) => v + result.offset[i]) as Vec3;
  const src = { positions: result.positions, indices: result.indices, baseSize: result.size };

  return [meshPiece({ position, rotation: part.rotation, dimensions: part.dimensions }, src)];
}

function operandPieces(part: ScenePart): Promise<OperandPiece[]> | OperandPiece[] {
  if (isBooleanPart(part)) return booleanPieces(part);

  if (part.kind === 'mesh' && hasMesh(part.mesh)) return [meshPiece(part, part.mesh)];

  if (part.kind === 'cad_part' && hasMesh(part.cad)) return [meshPiece(part, part.cad)];

  return builtPieces(part);
}

export const plainResult = (out: CsgOutput | null): BooleanResult | null =>
  out && { positions: Array.from(out.positions), indices: Array.from(out.indices), offset: out.offset, size: out.size };

async function run(part: BooleanPart): Promise<BooleanResult | null> {
  const operands = await Promise.all(part.boolean.operands.map(operandPieces));
  const job = { op: part.boolean.op, operands, origin: baseOf(part).position, rotation: part.rotation };

  return plainResult(await geometryWorker.call('boolean', job));
}

export function evaluateBoolean(part: BooleanPart): Promise<BooleanResult | null> {
  const hash = booleanHash(part);

  if (results.has(hash)) return Promise.resolve(results.get(hash)!);

  const pending = running.get(hash);

  if (pending) return pending;

  const job = run(part)
    .catch(() => null)
    .then((result) => {
      remember(hash, result);
      running.delete(hash);

      return result;
    });

  running.set(hash, job);

  return job;
}
