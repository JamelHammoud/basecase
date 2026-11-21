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

export interface PrintRecord {
  id: string;
  plate: number;
  material: PrintMaterial;
  hash: string;
  parts: Array<{ id: string; key: string }>;
  printer: string;
  sentAt: string;
  state: 'sent' | 'printing' | 'printed' | 'failed' | 'cancelled' | 'reprint';
  note?: string;
  copies?: Array<{ id: string; partId: string; index: number; key: string }>;
  completion?: { enteredAt?: string; reportedAt?: string };
  reconciledAt?: string;
  sourceKeys?: Record<string, string>;
  revision?: string;
  sceneId?: string;
  origin?: 'entered' | 'sent';
  cycle?: string;
}

export interface PrintQuote {
  part: string;
  key: string;
  material: PrintMaterial;
  copies: number;
  usd?: number;
  refusal?: string;
  checkedAt: string;
}

export interface PrintService {
  madeBy?: 'service';
  quotes?: PrintQuote[];
}
