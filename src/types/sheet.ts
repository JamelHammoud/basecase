export type SheetMaterial = 'aluminum-6061' | 'carbon-fiber' | 'acrylic';

export interface PartSheet {
  material: SheetMaterial;
  thicknessMm: number;
}

export interface SheetProfile {
  thicknessMm: number;
  center?: [number, number, number];
  outline: Array<[number, number]>;
  holes: Array<Array<[number, number]>>;
  normal: [number, number, number];
}

export interface SheetFields {
  sheet?: PartSheet;
  sheetTransform?: number[];
}
