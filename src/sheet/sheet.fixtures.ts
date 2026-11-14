import { evaluateBoolean } from '../booleans/evaluate';
import { booleanHash } from '../booleans/hash';
import { booleanPart, withResult, type BooleanPart } from '../booleans/parts';
import { buildPartGroup } from '../three/buildPartMesh';
import { localTriangles } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';

type V3 = [number, number, number];

export const solid = (over: Partial<ScenePart> & Pick<ScenePart, 'id' | 'kind'>): ScenePart => ({
  name: over.id,
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 60, height: 3, depth: 40 },
  color: '#888888',
  note: '',
  mechanicalTag: '3D Printed PLA/PETG',
  visible: true,
  locked: false,
  ...over,
});

export const HOLE_CENTERS: Array<[number, number]> = [
  [-24, -14],
  [24, -14],
  [-24, 14],
  [24, 14],
];

export const HOLE_RADIUS = 1.7;

async function subtracted(id: string, base: ScenePart, tools: ScenePart[]): Promise<BooleanPart> {
  const p = booleanPart({ id, base, tools, op: 'subtract' });

  return withResult(p, booleanHash(p), await evaluateBoolean(p));
}

export function plateWithHoles(id = 'plate', name = 'Shin plate'): Promise<BooleanPart> {
  const base = solid({ id: `${id}-blank`, kind: 'box', name });
  const holes = HOLE_CENTERS.map(([x, z], i) =>
    solid({
      id: `${id}-hole-${i}`,
      kind: 'cylinder',
      role: 'cutout',
      position: [x, 0, z] as V3,
      dimensions: { width: HOLE_RADIUS * 2, height: 10, depth: HOLE_RADIUS * 2 },
    }),
  );

  return subtracted(id, base, holes);
}

export function pocketedBox(): Promise<BooleanPart> {
  const base = solid({ id: 'block', kind: 'box', dimensions: { width: 40, height: 10, depth: 40 } });
  const pocket = solid({
    id: 'pocket',
    kind: 'box',
    role: 'cutout',
    position: [0, 4, 0],
    dimensions: { width: 20, height: 6, depth: 20 },
  });

  return subtracted('pocketed', base, [pocket]);
}

export const trianglesOf = (part: ScenePart) =>
  localTriangles(buildPartGroup({ ...part, position: [0, 0, 0], rotation: [0, 0, 0] }, false));
