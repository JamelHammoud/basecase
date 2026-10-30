import type { PrintMaterial } from './robotics';

export interface PartPrint {
  down?: [number, number, number];
  plate?: number;
  at?: [number, number];
  turned?: boolean;
  copies?: number;
  skip?: boolean;
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
