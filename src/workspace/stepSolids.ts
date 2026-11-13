import * as THREE from 'three';
import { hasDeformers } from '../three/partMesh/context';
import { meshScale } from '../three/partMesh/creased';
import type { PartDimensions, PartKind, ScenePart } from '../types/robotics';
import type { BooleanRecipe, RecipePart, StepSolid } from '../types/step';

export type ExactSource = RecipePart & Partial<Pick<ScenePart, 'deformers' | 'sculptMesh' | 'boolean'>>;

const SAME_MM = 0.01;
const SAME_SCALE = 1e-3;
const DEG = Math.PI / 180;

export const TO_STEP = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, -1, 0),
);

const FROM_CAD = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 1, 0),
);
const UPRIGHT = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

export const rowsOf = (m: THREE.Matrix4) => {
  const e = m.elements;

  return [e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14]];
};

export const moved = (matrix: THREE.Matrix4, solid: StepSolid): StepSolid => ({
  type: 'moved',
  matrix: rowsOf(matrix),
  solid,
});

const upright = (solid: StepSolid) => moved(UPRIGHT, solid);
const column = (radii: [number, number], height: number) => upright({ type: 'cylinder', radii, height });

function tube({ width, height, depth, thickness = 4 }: PartDimensions): StepSolid | null {
  const outer = Math.min(width, depth) / 2;
  const inner = Math.max(1, outer - Math.min(thickness, outer * 0.75));

  if (inner >= outer) return null;

  return {
    type: 'boolean',
    op: 'subtract',
    solids: [column([outer, outer], height), column([inner, inner], height + 2)],
  };
}

function torus({ width, height, depth }: PartDimensions): StepSolid {
  const minor = Math.max(1.5, height / 2);
  const major = Math.max(minor + 1, Math.min(width, depth) / 2 - minor);

  return upright({ type: 'torus', major, minor });
}

const isRound = ({ width, depth }: PartDimensions) => Math.abs(width - depth) < SAME_MM;

const ARC_HEIGHT = { dome: 1, capsule: 1 / 4 };

const archesUp = (type: 'cone' | 'dome' | 'capsule', d: PartDimensions) =>
  type === 'cone' || d.height * ARC_HEIGHT[type] >= d.width / 2;

const roundSolid =
  (type: 'cone' | 'dome' | 'capsule') =>
  (d: PartDimensions): StepSolid | null =>
    isRound(d) && archesUp(type, d) ? upright({ type, radius: d.width / 2, height: d.height }) : null;

const sphere = (d: PartDimensions): StepSolid | null =>
  isRound(d) && Math.abs(d.width - d.height) < SAME_MM ? { type: 'sphere', radius: d.width / 2 } : null;

const box = ({ width, height, depth }: PartDimensions): StepSolid => ({ type: 'box', size: [width, height, depth] });

const PRIMITIVES: Partial<Record<PartKind, (d: PartDimensions) => StepSolid | null>> = {
  box,
  cube: box,
  hole_box: box,
  cylinder: (d) => column([d.width / 2, d.depth / 2], d.height),
  hole_cylinder: (d) => column([d.width / 2, d.depth / 2], d.height),
  tube,
  sphere,
  cone: roundSolid('cone'),
  torus,
  capsule: roundSolid('capsule'),
  dome: roundSolid('dome'),
};

const sameSize = (a: number[], b: number[]) => a.every((v, k) => Math.abs(v - b[k]) < SAME_MM);

export const placement = (part: Pick<ScenePart, 'position' | 'rotation'>) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(...part.position),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(part.rotation[0] * DEG, part.rotation[1] * DEG, part.rotation[2] * DEG),
    ),
    new THREE.Vector3(1, 1, 1),
  );

function replicadSolid(part: ExactSource): StepSolid | null {
  const cad = part.cad!;
  const scale = meshScale(part.dimensions, cad.baseSize);

  if (Math.max(...scale) - Math.min(...scale) > SAME_SCALE) return null;

  const fit = new THREE.Matrix4()
    .makeScale(scale[0], scale[0], scale[0])
    .multiply(new THREE.Matrix4().makeTranslation(-cad.originOffset[0], -cad.originOffset[1], -cad.originOffset[2]))
    .multiply(FROM_CAD);

  return moved(fit, { type: 'code', code: cad.code });
}

function cutSolid(back: THREE.Matrix4, op: BooleanRecipe['op'], operands: ExactSource[]): StepSolid | null {
  const solids = operands.map((o) => {
    const solid = exactSolid(o);

    return solid && moved(back.clone().multiply(placement(o)), solid);
  });

  return solids.every(Boolean) ? { type: 'boolean', op, solids: solids as StepSolid[] } : null;
}

function booleanSolid(part: ExactSource, csg: BooleanRecipe): StepSolid | null {
  const { width, height, depth } = part.dimensions;

  if (!sameSize([width, height, depth], csg.size)) return null;

  return cutSolid(
    new THREE.Matrix4().makeTranslation(-csg.origin[0], -csg.origin[1], -csg.origin[2]),
    csg.op,
    csg.operands,
  );
}

export function exactSolid(part: ExactSource): StepSolid | null {
  if (hasDeformers(part)) return null;

  if (part.kind === 'boolean')
    return part.boolean ? cutSolid(placement(part).invert(), part.boolean.op, part.boolean.operands) : null;

  if (part.csg) return booleanSolid(part, part.csg);

  if (part.sculptMesh) return null;

  if (part.kind === 'cad_part') return part.cad?.language === 'replicad' ? replicadSolid(part) : null;

  return PRIMITIVES[part.kind]?.(part.dimensions) ?? null;
}
