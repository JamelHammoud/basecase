import { Euler, Matrix4, Quaternion, Vector3, MathUtils } from 'three';
import type { ScenePart } from '../types/robotics';
import type { BoardPlacement, ElectronicsBoard } from './boardTypes';
import { boardProduct } from './boardProducts';
import { partMatrix } from '../utils/kinematicsMotion';
import { boardRequirement } from './boardConstraints';
import { boardHardwareOffsets, isBoardHardware } from './boardHardware';
import { componentSize } from '../data/components';

function catalogGeometry(part: ScenePart) {
  const modified = [
    'cad',
    'mesh',
    'sculptMesh',
    'customNodes',
    'deformers',
    'edges',
    'sheet',
    'sheetTransform',
  ] as const;
  const expected = componentSize(part.componentId!);

  return (
    part.role === 'solid' &&
    modified.every((key) => !part[key]) &&
    (['width', 'height', 'depth'] as const).every((axis) => Math.abs(part.dimensions[axis] - expected[axis]) < 0.01)
  );
}

export function boardModuleId(parts: ScenePart[], placement: BoardPlacement) {
  const product = boardProduct(placement.productId);

  if (!product?.componentId) return undefined;

  const part = parts.find((candidate) => candidate.id === placement.bindings[0]?.partId);

  if (
    part?.kind !== 'component' ||
    part.componentId !== product?.componentId ||
    part.componentVariant ||
    placement.bindings.some((binding) => binding.partId !== part.id) ||
    !catalogGeometry(part)
  )
    return undefined;

  return part.id;
}

function poseOf(matrix: Matrix4) {
  const position = new Vector3();
  const rotation = new Quaternion();

  matrix.decompose(position, rotation, new Vector3());

  const angles = new Euler().setFromQuaternion(rotation, 'XYZ');

  return {
    position: position.toArray(),
    rotation: [angles.x, angles.y, angles.z].map(MathUtils.radToDeg) as ScenePart['rotation'],
  };
}

export function mountedBoardParts(parts: ScenePart[], board: ElectronicsBoard | undefined) {
  const host = parts.find((part) => part.id === board?.partId);

  if (!host || !board) return parts;

  const updates = new Map<string, { position: ScenePart['position']; rotation: ScenePart['rotation'] }>();
  const owners = board.placements.map((placement) => boardModuleId(parts, placement));
  const uniqueOwners = new Set(owners.filter((id) => id && owners.indexOf(id) === owners.lastIndexOf(id)));

  for (const placement of board.placements) {
    const product = boardProduct(placement.productId);
    const id = product?.componentId && boardModuleId(parts, placement);

    if (!id || !uniqueOwners.has(id)) continue;

    const side = board.side === 'top' ? 1 : -1;
    const matrix = partMatrix(host)
      .multiply(
        new Matrix4().makeTranslation(
          placement.position[0],
          side * (host.dimensions.height / 2 + (product.modelHeightMm ?? 0)),
          placement.position[1],
        ),
      )
      .multiply(new Matrix4().makeRotationY((((product.modelTurnDeg ?? 0) - placement.rotation) * Math.PI) / 180));

    if (side < 0) matrix.multiply(new Matrix4().makeRotationX(Math.PI));

    updates.set(id, poseOf(matrix));
  }

  for (const offset of board.holes.flatMap((hole) => boardHardwareOffsets(hole, host.dimensions.height))) {
    if (
      !isBoardHardware(
        parts.find((part) => part.id === offset.id),
        offset.kind,
      )
    )
      continue;

    updates.set(offset.id, poseOf(partMatrix(host).multiply(new Matrix4().makeTranslation(...offset.position))));
  }

  return parts.map((part) => (updates.has(part.id) ? { ...part, ...updates.get(part.id)! } : part));
}

export function boardMountingFindings(parts: ScenePart[], board: ElectronicsBoard) {
  const expected = mountedBoardParts(parts, board);

  return parts.flatMap((part, index) => {
    if (expected[index] === part) return [];

    const matrix = partMatrix(part).elements;
    const target = partMatrix(expected[index]).elements;

    if (matrix.every((value, i) => Math.abs(value - target[i]) < 0.000001)) return [];

    return [
      {
        ...boardRequirement(board, 'stale-placement', 'Move the module to its saved board placement.'),
        partIds: [board.partId, part.id],
      },
    ];
  });
}
