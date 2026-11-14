import type { MeshMeasure } from '../three/meshMeasure';
import { SHEET_MATERIALS, snapThickness, type SheetMaterial } from './materials';

type SheetMeasure = Pick<MeshMeasure, 'min' | 'max' | 'volumeMm3' | 'sheet'>;

export function sheetThickness(material: SheetMaterial, m: Pick<SheetMeasure, 'min' | 'max' | 'sheet'>): number {
  const drawn = m.sheet?.thicknessMm ?? Math.min(...m.max.map((v, i) => v - m.min[i]));

  return snapThickness(material, drawn);
}

export function sheetGrams(material: SheetMaterial, m: SheetMeasure): number {
  const mm3 = m.sheet ? m.sheet.areaMm2 * sheetThickness(material, m) : m.volumeMm3;

  return (mm3 / 1000) * SHEET_MATERIALS[material].density;
}

export const sheetKey = (material: SheetMaterial, thicknessMm: number) => `sheet:${material}|${thicknessMm}`;
