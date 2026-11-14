export type SheetMaterial = 'aluminum' | 'carbon' | 'acrylic';

export interface PartSheet {
  material: SheetMaterial;
  thicknessMm?: number;
}

interface SheetStock {
  name: string;
  densityGcm3: number;
  stockMm: number[];
}

export const SHEET_MATERIALS: Record<SheetMaterial, SheetStock> = {
  aluminum: {
    name: '6061 aluminum',
    densityGcm3: 2.7,
    stockMm: [1.02, 1.6, 2.03, 2.54, 3.18, 4.75, 6.35, 7.95, 9.53, 12.7, 15.88, 19.05],
  },
  carbon: { name: 'Carbon fiber plate', densityGcm3: 1.55, stockMm: [1.02, 1.6, 2.01, 3, 3.99, 5, 8] },
  acrylic: { name: 'Acrylic', densityGcm3: 1.19, stockMm: [1.6, 3, 4.5, 5.4, 9.5, 12.7] },
};

export const SHEET_MATERIAL_IDS = Object.keys(SHEET_MATERIALS) as SheetMaterial[];

const LEGACY_TAGS: Record<string, SheetMaterial> = {
  'CNC Aluminum': 'aluminum',
  'Laser-Cut Acrylic/Carbon': 'acrylic',
};

export const isSheetMaterial = (v: unknown): v is SheetMaterial =>
  typeof v === 'string' && Object.hasOwn(SHEET_MATERIALS, v);

export function partSheet(p: { sheet?: PartSheet; mechanicalTag?: string }): PartSheet | undefined {
  if (p.sheet && isSheetMaterial(p.sheet.material)) return p.sheet;

  const legacy = p.mechanicalTag ? LEGACY_TAGS[p.mechanicalTag] : undefined;

  return legacy ? { material: legacy } : undefined;
}

export function stockThickness(mm: number, material: SheetMaterial): number {
  const stock = SHEET_MATERIALS[material].stockMm;

  return stock.reduce((best, s) => (Math.abs(s - mm) < Math.abs(best - mm) ? s : best), stock[0]);
}

export const sheetFor = (material: SheetMaterial, measuredMm: number | null | undefined): PartSheet =>
  measuredMm ? { material, thicknessMm: stockThickness(measuredMm, material) } : { material };

export const thicknessText = (mm: number) => `${Number(mm.toFixed(2))} mm`;

export const sheetText = (sheet: PartSheet) =>
  [SHEET_MATERIALS[sheet.material].name, sheet.thicknessMm ? thicknessText(sheet.thicknessMm) : '']
    .filter(Boolean)
    .join(' ');

export const sheetKey = (sheet: PartSheet) => `sheet:${sheet.material}|${sheet.thicknessMm ?? ''}`;

export function sheetFromKey(key: string): PartSheet | null {
  if (!key.startsWith('sheet:')) return null;

  const [material, mm] = key.slice('sheet:'.length).split('|');

  if (!isSheetMaterial(material)) return null;

  return mm ? { material, thicknessMm: Number(mm) } : { material };
}

export const sheetGrams = (volumeMm3: number, sheet: PartSheet) =>
  (volumeMm3 / 1000) * SHEET_MATERIALS[sheet.material].densityGcm3;
