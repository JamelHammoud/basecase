import { Matrix4 } from 'three';
import type { ScenePart } from '../types/robotics';
import { finiteTree, recordValue, vectorValue } from '../study/recordValues';
import { validSheetFields } from '../sheet/validation';
import { refuse, type Reader } from './validate';

function validMesh(value: unknown): boolean {
  if (value === undefined) return true;

  if (!recordValue(value) || !Array.isArray(value.positions) || !Array.isArray(value.indices)) return false;

  const count = value.positions.length / 3;

  return (
    count >= 3 &&
    Number.isInteger(count) &&
    count <= 2_000_000 &&
    value.indices.length % 3 === 0 &&
    value.indices.length <= 6_000_000 &&
    value.indices.every((v) => Number.isInteger(v) && v >= 0 && v < count) &&
    vectorValue(value.baseSize) &&
    value.baseSize.every((v) => v > 0)
  );
}

function validGeometry(value: unknown): value is ScenePart {
  if (!recordValue(value) || !recordValue(value.dimensions)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    value.kind !== 'image_plane' &&
    typeof value.name === 'string' &&
    typeof value.color === 'string' &&
    value.role === 'solid' &&
    vectorValue(value.position) &&
    vectorValue(value.rotation) &&
    [value.dimensions.width, value.dimensions.height, value.dimensions.depth].every(
      (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 10_000,
    ) &&
    validSheetFields(value) &&
    validMesh(value.mesh) &&
    validMesh(value.cad) &&
    finiteTree(value)
  );
}

export const readFixtureGeometry: Reader<ScenePart> = (value, where) =>
  validGeometry(value) ? value : refuse(where, 'needs finite editable scene geometry');

export function fixtureMass(part: Pick<ScenePart, 'dimensions' | 'massG' | 'sheetTransform'>): number {
  const d = part.dimensions;
  const scale = part.sheetTransform ? Math.abs(new Matrix4().fromArray(part.sheetTransform).determinant()) : 1;

  return part.massG ?? Math.max(0.1, d.width * d.height * d.depth * scale * 0.0005);
}
