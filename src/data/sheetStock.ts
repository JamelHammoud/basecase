import type { SheetMaterial } from '../types/print';

export interface SheetStock {
  label: string;
  density: number;
  thicknesses: number[];
}

export const SHEET_STOCK: Record<SheetMaterial, SheetStock> = {
  aluminum: {
    label: '6061 aluminum',
    density: 2.7,
    thicknesses: [1.02, 1.6, 2.03, 2.29, 3.18, 4.06, 4.83, 6.35, 9.53, 12.7],
  },
  carbon: { label: 'Carbon fiber plate', density: 1.55, thicknesses: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6] },
  acrylic: { label: 'Acrylic', density: 1.19, thicknesses: [1.5, 2, 3, 4.5, 6, 9, 12] },
};
