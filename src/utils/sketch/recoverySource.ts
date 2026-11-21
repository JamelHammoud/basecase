import { RECOVERY_ERRORS } from './recoveryErrors';
import type { ScenePart } from '../../types/robotics';
import { validSheetTransform } from '../../sheet/validation';
import { sheetOf } from '../../sheet/materials';
import { RECOVERY_LIMITS } from './recoveryTopology';
import { withinSupportBudget } from './supportBudget';

export function canRecoverImport(part: ScenePart): boolean {
  return (
    part.kind === 'mesh' &&
    part.role === 'solid' &&
    !!part.mesh?.file &&
    !part.sketch &&
    !part.componentId &&
    !part.hardware &&
    !part.supplyId &&
    !part.robotLink &&
    !part.simready &&
    !part.locked
  );
}

export function validateRecoveryEntry(part: ScenePart) {
  if (!canRecoverImport(part)) throw new Error(RECOVERY_ERRORS.source);

  const text = [
    part.id,
    part.name,
    part.color,
    part.category,
    part.mechanicalTag ?? '',
    part.mesh!.source ?? '',
    part.mesh!.file ?? '',
  ];

  if (!text.every((value) => typeof value === 'string' && value.length <= 2048)) throw new Error(RECOVERY_ERRORS.limit);

  validateDeclarations(part);
  validateSourceTransform(part);
  validateSourceMeshLimits(part);
}

export function validateRecoverySource(part: ScenePart) {
  validateRecoveryEntry(part);

  if (!withinSupportBudget(part, 4 * 1024 * 1024)) throw new Error(RECOVERY_ERRORS.limit);

  const mesh = part.mesh!;

  if (
    !mesh.positions.every(Number.isFinite) ||
    !mesh.indices.every((i) => Number.isInteger(i) && i >= 0 && i * 3 + 2 < mesh.positions.length)
  )
    throw new Error(RECOVERY_ERRORS.geometry);
}

function validateDeclarations(part: ScenePart) {
  if (
    sheetOf(part) ||
    part.massG !== undefined ||
    part.com !== undefined ||
    part.dimensionBindings?.length ||
    part.mates?.length ||
    part.frame ||
    part.mirrorOf
  )
    throw new Error(RECOVERY_ERRORS.references);
}

export function recoveryInput(part: ScenePart): ScenePart {
  const mesh = part.mesh!;

  return {
    id: part.id,
    name: part.name,
    color: part.color,
    category: part.category,
    kind: 'mesh',
    role: 'solid',
    visible: true,
    locked: false,
    note: '',
    position: part.position,
    rotation: part.rotation,
    dimensions: { width: part.dimensions.width, height: part.dimensions.height, depth: part.dimensions.depth },
    sheetTransform: part.sheetTransform,
    mesh: {
      positions: mesh.positions,
      indices: mesh.indices,
      baseSize: mesh.baseSize,
      source: mesh.source,
      file: mesh.file,
    },
  };
}

function validateSourceTransform(part: ScenePart) {
  const mesh = part.mesh!;
  const vectors = [
    part.position,
    part.rotation,
    mesh.baseSize,
    [part.dimensions.width, part.dimensions.height, part.dimensions.depth],
  ];

  if (
    vectors.some((v) => v.length !== 3 || !v.every(Number.isFinite)) ||
    mesh.baseSize.some((v) => v <= 0) ||
    vectors[3].some((v) => v <= 0)
  )
    throw new Error(RECOVERY_ERRORS.geometry);

  if (
    part.cad ||
    part.deformers ||
    part.sculptMesh ||
    part.edges ||
    mesh.visual ||
    (part.sheetTransform && !validSheetTransform(part.sheetTransform))
  )
    throw new Error(RECOVERY_ERRORS.geometry);
}

function validateSourceMeshLimits(part: ScenePart) {
  const mesh = part.mesh!;

  if (
    !Array.isArray(mesh.positions) ||
    !Array.isArray(mesh.indices) ||
    mesh.positions.length > RECOVERY_LIMITS.triangles * 9 ||
    mesh.indices.length > RECOVERY_LIMITS.triangles * 3 ||
    mesh.indices.length % 3 ||
    mesh.positions.length % 3 ||
    !mesh.indices.length
  )
    throw new Error(RECOVERY_ERRORS.limit);
}
