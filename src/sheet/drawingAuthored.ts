import type { ScenePart } from '../types/robotics';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { worldTriangles } from '../three/meshMeasure';
import { GROUND_PLANE, partFromSolid, sketchSolid } from '../utils/sketch/placement';
import { DRAWING_LIMITS } from './drawingTypes';

export function matchingDrawingSketch(part: ScenePart, triangles: Float32Array) {
  const record = part.sketch;

  if (
    !record ||
    record.mode !== 'extrude' ||
    part.kind !== 'custom_model' ||
    part.deformers ||
    part.edges ||
    part.sculptMesh ||
    part.sheetTransform
  )
    return undefined;

  const solid = sketchSolid(GROUND_PLANE, record, part);

  if (!solid) return undefined;

  const expected = partFromSolid(part, solid);
  const group = buildPartGroup({ ...expected, position: [0, 0, 0], rotation: [0, 0, 0] }, false);

  try {
    const measured = worldTriangles(group);

    if (
      measured.length !== triangles.length ||
      !measured.every((value, index) => Math.abs(value - triangles[index]) <= DRAWING_LIMITS.toleranceMm)
    )
      return undefined;

    return { entities: record.sketch.entities.map((entity) => entity.id), depthMm: Math.abs(record.depth) };
  } finally {
    releasePartGroup(group);
  }
}
