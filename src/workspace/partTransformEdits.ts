import { sheetOf } from '../sheet/materials';
import type { PartTransformUpdate } from '../three/viewport/types';
import type { PartDimensions, ScenePart } from '../types/robotics';

const DIMENSIONS: Array<keyof PartDimensions> = ['width', 'height', 'depth', 'thickness', 'holeDiameter'];

export function withPartTransform(part: ScenePart, update: Omit<PartTransformUpdate, 'id'>): ScenePart {
  const dimensions = update.dimensions ?? part.dimensions;
  const resized = DIMENSIONS.some((key) => dimensions[key] !== part.dimensions[key]);
  const changed = { ...part, position: update.position, rotation: update.rotation, dimensions };

  if (resized && sheetOf(part)) return { ...changed, sheet: undefined, mechanicalTag: '3D Printed PLA/PETG' };

  return changed;
}
