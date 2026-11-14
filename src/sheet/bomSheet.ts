import type { BomCategory } from '../utils/bomTypes';
import type { PartSheet } from '../types/print';
import { isSheetMaterial, SHEET_MATERIALS } from './materials';

export const SHEET_KEY_PREFIX = 'sheet:';

export const sheetKey = (s: PartSheet) => `${SHEET_KEY_PREFIX}${s.material}|${s.thicknessMm}`;

export function describeSheetKey(key: string) {
  const [material, thickness] = key.slice(SHEET_KEY_PREFIX.length).split('|');

  if (!isSheetMaterial(material) || !Number(thickness)) return null;

  return {
    category: 'Sheet' as BomCategory,
    name: SHEET_MATERIALS[material].label,
    detail: `${Number(thickness)} mm`,
    urlKind: 'none' as const,
  };
}
