export type SheetMaterial = 'aluminum' | 'carbon' | 'acrylic';

export interface PartSheet {
  material: SheetMaterial;
}

export interface SheetMaterialInfo {
  name: string;
  slug: string;
  density: number;
  stockMm: number[];
}

export const SHEET_MATERIALS: Record<SheetMaterial, SheetMaterialInfo> = {
  aluminum: {
    name: '6061 aluminum',
    slug: 'aluminum-6061',
    density: 2.7,
    stockMm: [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12],
  },
  carbon: {
    name: 'Carbon fiber',
    slug: 'carbon-fiber',
    density: 1.55,
    stockMm: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6],
  },
  acrylic: {
    name: 'Acrylic',
    slug: 'acrylic',
    density: 1.19,
    stockMm: [2, 3, 4, 5, 6, 8, 10, 12],
  },
};

export const SHEET_MATERIAL_IDS = Object.keys(SHEET_MATERIALS) as SheetMaterial[];

export const MAX_STOCK_MM = Math.max(...SHEET_MATERIAL_IDS.flatMap((m) => SHEET_MATERIALS[m].stockMm));

const ACRYLIC_WORDS = /acrylic|clear|perspex|plexi/i;

interface LegacyTagged {
  mechanicalTag?: string;
  name?: string;
  note?: string;
}

function legacySheet({ mechanicalTag, name = '', note = '' }: LegacyTagged): SheetMaterial | undefined {
  if (mechanicalTag === 'CNC Aluminum') return 'aluminum';

  if (mechanicalTag !== 'Laser-Cut Acrylic/Carbon') return undefined;

  return ACRYLIC_WORDS.test(`${name} ${note}`) ? 'acrylic' : 'carbon';
}

export const isSheetMaterial = (value: unknown): value is SheetMaterial =>
  typeof value === 'string' && value in SHEET_MATERIALS;

export const sheetChoice = (p: LegacyTagged & { sheet?: PartSheet }): SheetMaterial | undefined =>
  p.sheet?.material ?? legacySheet(p);

export function snapThickness(material: SheetMaterial, mm: number): number {
  return SHEET_MATERIALS[material].stockMm.reduce((best, s) => (Math.abs(s - mm) < Math.abs(best - mm) ? s : best));
}
