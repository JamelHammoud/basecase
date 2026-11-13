import * as THREE from 'three';
import { builtPieces, hasMesh, meshPiece } from './evaluate';
import type { ScenePart } from '../types/robotics';
import { isBooleanPart, operandIdsDeep, type BooleanPart } from './parts';

const BOTH_SIDES = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

function savedMesh(part: ScenePart) {
  if ((part.kind === 'mesh' || part.kind === 'boolean') && hasMesh(part.mesh)) return part.mesh;

  return part.kind === 'cad_part' && hasMesh(part.cad) ? part.cad : null;
}

function probesOf(operand: ScenePart): THREE.Mesh[] {
  const saved = savedMesh(operand);
  const pieces = saved ? [meshPiece(operand, saved)] : builtPieces(operand);

  return pieces.map((piece) => {
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(piece.positions, 3));

    if (piece.indices) geometry.setIndex(new THREE.BufferAttribute(piece.indices, 1));

    const probe = new THREE.Mesh(geometry, BOTH_SIDES);

    probe.matrixWorld.fromArray(piece.matrix);

    return probe;
  });
}

function closestHit(operand: ScenePart, raycaster: THREE.Raycaster, distance: number): number {
  const gaps = probesOf(operand).flatMap((probe) =>
    raycaster.intersectObject(probe, false).map((hit) => Math.abs(hit.distance - distance)),
  );

  return gaps.length ? Math.min(...gaps) : Infinity;
}

export function operandAt(part: BooleanPart, raycaster: THREE.Raycaster, distance: number): ScenePart | null {
  const scored = part.boolean.operands.map((operand) => ({ operand, gap: closestHit(operand, raycaster, distance) }));
  const best = scored.reduce((a, b) => (b.gap < a.gap ? b : a));

  return Number.isFinite(best.gap) ? best.operand : null;
}

export interface DrillQuery {
  part: ScenePart;
  raycaster: THREE.Raycaster;
  distance: number;
  selected: ReadonlySet<string>;
  drill: boolean;
}

export function drillTarget({ part, raycaster, distance, selected, drill }: DrillQuery): string {
  let current = part;
  let extra = drill;

  while (isBooleanPart(current)) {
    const inside = operandIdsDeep([current]).some((id) => selected.has(id));

    if (!inside && !extra) break;

    extra = extra && inside;

    const next = operandAt(current, raycaster, distance);

    if (!next) break;

    current = next;
  }

  return current.id;
}

export function drilledOperands(parts: ScenePart[], selectedIds: readonly string[]): ScenePart[] {
  const selected = new Set(selectedIds);
  const walk = (part: ScenePart): ScenePart[] =>
    isBooleanPart(part)
      ? part.boolean.operands.flatMap((o) => [...(selected.has(o.id) ? [ghostOf(o)] : []), ...walk(o)])
      : [];

  return parts.flatMap(walk);
}

const ghostOf = (operand: ScenePart): ScenePart =>
  operand.role === 'cutout' ? operand : { ...operand, role: 'reference', color: '#0d99ff' };
