import type { ScenePart } from '../types/robotics';
import { selectionBounds } from './selection';

const tenth = (v: number) => Math.round(v * 10) / 10;

export function solidSizeMm(parts: ScenePart[]): [number, number, number] | null {
  const solid = parts.filter((p) => p.visible && p.role === 'solid' && p.kind !== 'image_plane');

  if (solid.length === 0) {
    return null;
  }

  const { min, max } = selectionBounds(solid);

  return [tenth(max[0] - min[0]), tenth(max[1] - min[1]), tenth(max[2] - min[2])];
}
