import type { ListPrice } from '../data/listPrices';
import type { EnteredPrice, PrintMaterial, PrintQuote, PurchaseRecord } from '../types/robotics';

export const STALE_DAYS = 60;
export const FILAMENT_MARGIN = 0.15;

export type BomCategory =
  | 'Components'
  | 'Hardware'
  | 'Added by Agent'
  | 'Supplies'
  | 'Materials'
  | 'Sheet'
  | 'Filament'
  | 'Printed parts'
  | 'Equipment';
export type PriceStatus = 'checked' | 'stale' | 'unchecked';

export const BOM_CATEGORIES: BomCategory[] = [
  'Components',
  'Hardware',
  'Added by Agent',
  'Supplies',
  'Materials',
  'Sheet',
  'Filament',
  'Printed parts',
  'Equipment',
];

export interface BomLine {
  key: string;
  category: BomCategory;
  name: string;
  detail: string;
  qty: number;
  owned: number;
  toBuy: number;
  unit: 'pcs' | 'g';
  partIds: string[];
  url?: string;
  urlKind: 'product' | 'search' | 'none';
  record?: PurchaseRecord;
  quote?: PrintQuote;
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
    budgetEntered?: EnteredPrice;
    overBudget: boolean;
  };
}

export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const daysSince = (iso: string, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000));
