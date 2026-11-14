import type { ScenePart } from '../types/robotics';
import type { SheetProfile } from '../types/sheet';
import { partBounds } from '../utils/selection';
import { r2, toCad, type V3 } from './agentFrame';

function boxToCad(b: { min: V3; max: V3 }) {
  const a = toCad(b.min);
  const c = toCad(b.max);

  return {
    min: [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.min(a[2], c[2])].map(r2),
    max: [Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.max(a[2], c[2])].map(r2),
  };
}

export type PartBoxes = Record<string, { min: V3; max: V3; sheet?: SheetProfile } | undefined>;

export const partBoundsCad = (p: ScenePart, measured?: PartBoxes) => boxToCad(measured?.[p.id] ?? partBounds(p));
