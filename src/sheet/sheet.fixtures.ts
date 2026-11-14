import { evaluateBoolean } from '../booleans/evaluate';
import { booleanHash } from '../booleans/hash';
import { booleanPart, withResult } from '../booleans/parts';
import { buildPartGroup } from '../three/buildPartMesh';
import { localTriangles } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';

export const PLATE = { width: 100, depth: 60, thickness: 3, holeDiameter: 3.4 };
export const HOLE_CENTERS: Array<[number, number]> = [
  [-40, -20],
  [40, -20],
  [-40, 20],
  [40, 20],
];

export const solidPart = (over: Partial<ScenePart> & Pick<ScenePart, 'id' | 'kind'>): ScenePart => ({
  name: over.id,
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height: 20, depth: 30 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  ...over,
});

const hole = (i: number, [x, z]: [number, number], height: number): ScenePart =>
  solidPart({
    id: `hole-${i}`,
    kind: 'cylinder',
    role: 'cutout',
    position: [x, height / 2, z],
    dimensions: { width: PLATE.holeDiameter, height: height + 10, depth: PLATE.holeDiameter },
  });

export async function platePart(name = 'Shin Plate'): Promise<ScenePart> {
  const base = solidPart({
    id: 'plate',
    kind: 'box',
    name,
    position: [0, PLATE.thickness / 2, 0],
    dimensions: { width: PLATE.width, height: PLATE.thickness, depth: PLATE.depth },
  });
  const p = booleanPart({
    id: 'plate-result',
    base,
    tools: HOLE_CENTERS.map((c, i) => hole(i, c, PLATE.thickness)),
    op: 'subtract',
  });

  return withResult(p, booleanHash(p), await evaluateBoolean(p));
}

export async function pocketedBox(): Promise<ScenePart> {
  const base = solidPart({
    id: 'block',
    kind: 'box',
    position: [0, 10, 0],
    dimensions: { width: 60, height: 20, depth: 60 },
  });
  const pocket = solidPart({
    id: 'pocket',
    kind: 'box',
    role: 'cutout',
    position: [0, 20, 0],
    dimensions: { width: 30, height: 10, depth: 30 },
  });
  const p = booleanPart({ id: 'block-result', base, tools: [pocket], op: 'subtract' });

  return withResult(p, booleanHash(p), await evaluateBoolean(p));
}

export const trianglesOf = (part: ScenePart) => localTriangles(buildPartGroup(part, false));
