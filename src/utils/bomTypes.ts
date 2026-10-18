import type { ListPrice } from '../data/listPrices';
import type { PrintMaterial, PurchaseRecord } from '../types/robotics';

export const STALE_DAYS = 60;
export const FILAMENT_MARGIN = 0.15;

export type BomCategory = 'Components' | 'Hardware' | 'Supplies' | 'Filament';
export type PriceStatus = 'checked' | 'stale' | 'unchecked';

export const BOM_CATEGORIES: BomCategory[] = ['Components', 'Hardware', 'Supplies', 'Filament'];

export interface BomLine {
  key: string;
  category: BomCategory;
  name: string;
  detail: string;
  qty: number;
  unit: 'pcs' | 'g';
  partIds: string[];
  url?: string;
  urlKind: 'product' | 'search' | 'none';
  record?: PurchaseRecord;
  status: PriceStatus;
  ageDays?: number;
  packs?: number;
  lineUsd?: number;
  estimate?: ListPrice;
  estUsd?: number;
  warning?: string;
}

export interface PrintedPart {
  id: string;
  name: string;
  material: PrintMaterial;
  volumeMm3: number;
  areaMm2: number;
  grams: number;
  size: [number, number, number];
}

export interface Bom {
  lines: BomLine[];
  printed: PrintedPart[];
  standIns: Array<{ id: string; name: string }>;
  unmeasured: string[];
  madeElsewhere: Array<{ id: string; name: string; process: string }>;
  filamentG: Partial<Record<PrintMaterial, number>>;
  totals: {
    checkedUsd: number;
    pricedUsd: number;
    checked: number;
    stale: number;
    unchecked: number;
    estimatedUsd: number;
    unpriced: number;
    budgetUsd?: number;
    overBudget: boolean;
  };
}

export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
