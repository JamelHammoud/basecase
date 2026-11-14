import type { PrintMaterial } from './robotics';

export interface PartPrint {
  down?: [number, number, number];
  plate?: number;
  at?: [number, number];
  turned?: boolean;
  copies?: number;
  skip?: boolean;
  noLabel?: boolean;
}

export type SheetMaterial = 'aluminum' | 'carbon' | 'acrylic';

export interface PartSheet {
  material: SheetMaterial;
  thickness: number;
}

export interface PrintRecord {
  id: string;
  plate: number;
  material: PrintMaterial;
  hash: string;
  parts: Array<{ id: string; key: string }>;
  printer: string;
  sentAt: string;
  state: 'sent' | 'printing' | 'printed' | 'failed' | 'cancelled';
  note?: string;
}
