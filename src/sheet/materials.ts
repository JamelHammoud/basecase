import type { PartDimensions, ScenePart } from '../types/robotics';
import type { PartSheet, SheetMaterial } from '../types/print';

export interface SheetMaterialInfo {
  label: string;
  densityGcm3: number;
  stockMm: number[];
}

export const SHEET_MATERIALS: Record<SheetMaterial, SheetMaterialInfo> = {
  aluminum: {
    label: '6061 aluminum',
    densityGcm3: 2.7,
    stockMm: [0.8, 1, 1.5, 1.6, 2, 2.5, 3, 3.2, 4, 4.8, 5, 6, 6.35, 8, 9.5, 10, 12, 12.7],
  },
  carbon: { label: 'Carbon fiber plate', densityGcm3: 1.55, stockMm: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6] },
  acrylic: { label: 'Acrylic', densityGcm3: 1.19, stockMm: [1.5, 2, 3, 4.5, 5, 6, 8, 9.5, 10, 12] },
};

export const SHEET_MATERIAL_IDS = Object.keys(SHEET_MATERIALS) as SheetMaterial[];

export const isSheetMaterial = (value: unknown): value is SheetMaterial =>
  typeof value === 'string' && value in SHEET_MATERIALS;

export const LEGACY_SHEET_TAGS: Record<string, SheetMaterial> = {
  'CNC Aluminum': 'aluminum',
  'Laser-Cut Acrylic/Carbon': 'carbon',
};

export function snapThickness(material: SheetMaterial, mm: number): number {
  const stock = SHEET_MATERIALS[material].stockMm;

  return stock.reduce((best, s) => (Math.abs(s - mm) < Math.abs(best - mm) ? s : best), stock[0]);
}

const thinnest = (d: PartDimensions) => Math.min(d.width, d.height, d.depth);

export function sheetOf(p: Pick<ScenePart, 'sheet' | 'mechanicalTag' | 'dimensions'>): PartSheet | undefined {
  if (p.sheet) return p.sheet;

  const legacy = p.mechanicalTag ? LEGACY_SHEET_TAGS[p.mechanicalTag] : undefined;

  return legacy && { material: legacy, thicknessMm: snapThickness(legacy, thinnest(p.dimensions)) };
}

export const sheetLabel = (s: PartSheet) => `${SHEET_MATERIALS[s.material].label}, ${s.thicknessMm} mm`;
