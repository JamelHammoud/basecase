import * as THREE from 'three';
import { buildPartGroup } from '../three/buildPartMesh';
import { componentMeshesReady } from '../three/componentMeshes';
import type { ScenePart } from '../types/robotics';
import type { StepBody, StepJob, StepSolid } from '../types/step';
import { exactSolid, placement, rowsOf, TO_STEP } from './stepSolids';

const HEX = /^#[0-9a-f]{6}$/i;
const FALLBACK_COLOR = '#9a9a9e';
const FROM_STEP = TO_STEP.clone().invert();

export const isStepBody = (part: ScenePart) => part.visible && part.role === 'solid' && part.kind !== 'image_plane';

function triangles(group: THREE.Group): Float32Array | null {
  const soup: number[] = [];
  const toStep = new THREE.Matrix4();

  group.updateMatrixWorld(true);
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible || !child.geometry) return;

    const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    const position = geometry.getAttribute('position');

    geometry.applyMatrix4(toStep.copy(TO_STEP).multiply(child.matrixWorld));

    for (let i = 0; i < position.count * 3; i++) soup.push(position.array[i]);
  });

  return soup.length >= 9 ? Float32Array.from(soup) : null;
}

export function meshSolid(part: ScenePart): StepSolid | null {
  const group = buildPartGroup({ ...part, position: [0, 0, 0], rotation: [0, 0, 0] }, false);

  if (group.userData.placeholder) return null;

  const positions = triangles(group);

  return positions && { type: 'mesh', positions };
}

const mayFail = (solid: StepSolid) =>
  solid.type === 'boolean' || (solid.type === 'moved' && solid.solid.type === 'code');

function stepBody(part: ScenePart, group?: string): StepBody | null {
  const exact = exactSolid(part);
  const mesh = !exact || mayFail(exact) ? meshSolid(part) : null;
  const solid = exact ? { type: 'moved' as const, matrix: rowsOf(TO_STEP), solid: exact } : mesh;

  if (!solid) return null;

  return {
    name: part.name,
    color: HEX.test(part.color) ? part.color : FALLBACK_COLOR,
    ...(group ? { group } : {}),
    place: rowsOf(TO_STEP.clone().multiply(placement(part)).multiply(FROM_STEP)),
    solid,
    ...(exact && mesh ? { fallback: mesh } : {}),
  };
}

function groupNames(parts: ScenePart[]) {
  const names = new Map<string, string>();
  const used = new Map<string, number>();

  for (const { group } of parts) {
    if (!group || names.has(group.id)) continue;

    const seen = (used.get(group.name) ?? 0) + 1;

    used.set(group.name, seen);
    names.set(group.id, seen > 1 ? `${group.name} ${seen}` : group.name);
  }

  return names;
}

export async function stepJob(parts: ScenePart[], name: string): Promise<{ job: StepJob; left: number }> {
  const included = parts.filter(isStepBody);

  await componentMeshesReady(included.flatMap((p) => (p.componentId ? [p.componentId] : [])));

  const groups = groupNames(included);
  const bodies = included.flatMap((part) => {
    const body = stepBody(part, part.group && groups.get(part.group.id));

    return body ? [body] : [];
  });

  return { job: { name, bodies }, left: included.length - bodies.length };
}
