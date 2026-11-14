import type { PartDimensions, ScenePart } from '../types/robotics';
import type { SheetMaterial } from '../types/print';
import { MAX_THICKNESS_MM, type SheetProfile } from './detect';
import { LEGACY_SHEET_TAGS, sheetOf, snapThickness } from './materials';

export const PRINTED_TAG = '3D Printed PLA/PETG';

const DIMENSION_KEYS = ['width', 'height', 'depth'] as const;

type Fit = Pick<SheetProfile, 'axis' | 'thicknessMm'>;

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function dimensionFit(dimensions: PartDimensions): Fit | null {
  const sizes = DIMENSION_KEYS.map((k) => dimensions[k]);
  const axis = sizes.indexOf(Math.min(...sizes)) as Fit['axis'];

  return sizes[axis] <= MAX_THICKNESS_MM ? { axis, thicknessMm: sizes[axis] } : null;
}

const legacyTagCleared = (part: ScenePart) =>
  part.mechanicalTag && LEGACY_SHEET_TAGS[part.mechanicalTag] ? { mechanicalTag: PRINTED_TAG } : {};

export interface SheetChoice {
  material: SheetMaterial;
  thicknessMm?: number;
}

export function sheetPatch(part: ScenePart, choice: SheetChoice, fit: Fit | null): Partial<ScenePart> {
  const measured =
    fit?.thicknessMm ?? sheetOf(part)?.thicknessMm ?? Math.min(...DIMENSION_KEYS.map((k) => part.dimensions[k]));
  const thicknessMm = snapThickness(choice.material, choice.thicknessMm ?? measured);
  const patch = { sheet: { material: choice.material, thicknessMm }, ...legacyTagCleared(part) };

  if (!fit || Math.abs(thicknessMm - fit.thicknessMm) < 0.001) return patch;

  const key = DIMENSION_KEYS[fit.axis];

  return {
    ...patch,
    dimensions: { ...part.dimensions, [key]: r3((part.dimensions[key] * thicknessMm) / fit.thicknessMm) },
  };
}

export const printedPatch = (part: ScenePart): Partial<ScenePart> => ({ sheet: undefined, ...legacyTagCleared(part) });

export const unsheetPatch = (part: ScenePart, mechanicalTag: string): Partial<ScenePart> =>
  sheetOf(part) ? { sheet: undefined, mechanicalTag } : { mechanicalTag };
