import { sheetOf } from '../sheet/materials';
import type { ScenePart, SculptMeshData } from '../types/robotics';

export function withSculptMesh(part: ScenePart, sculptMesh: SculptMeshData): ScenePart {
  return {
    ...part,
    sculptMesh,
    kind: 'sculpt_mesh',
    csg: undefined,
    boolean: undefined,
    sheet: undefined,
    sheetTransform: undefined,
    edges: undefined,
    deformers: undefined,
    mechanicalTag: sheetOf(part) ? '3D Printed PLA/PETG' : part.mechanicalTag,
  };
}
