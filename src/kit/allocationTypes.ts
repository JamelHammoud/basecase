import type { PrintRecord } from '../types/print';
import type { PurchaseIdentity } from '../types/purchasing';

export interface BuildOwner {
  id: string;
  name: string;
  kit: string;
  repair?: string;
  revision?: string;
}

export interface ComponentDemand {
  key: string;
  name: string;
  qty: number;
  partIds: string[];
  identity?: PurchaseIdentity;
}

export interface PrintedDemand {
  partId: string;
  key: string;
  material: string;
  qty: number;
  shape?: string;
  labels?: string;
}

export interface AllocationEvent {
  request: string;
  action: 'reserve' | 'return';
  quantity: number;
  at: string;
}

export interface ComponentReservation {
  build: BuildOwner;
  demand: ComponentDemand;
  quantity: number;
  returned: number;
  events: AllocationEvent[];
}

export interface CopyAssignment {
  build: BuildOwner;
  demand: PrintedDemand;
  request: string;
  at: string;
  returnedAt?: string;
  returnRequest?: string;
}

export interface ProductionPurchase {
  reservations?: ComponentReservation[];
  printOutput?: {
    record: PrintRecord;
    assignments: Record<string, CopyAssignment[]>;
  };
}

export type AllocationRequest =
  | {
      kind: 'reserve' | 'return';
      request: string;
      build: BuildOwner;
      demand: ComponentDemand;
      quantity: number;
    }
  | { kind: 'print'; record: PrintRecord }
  | {
      kind: 'assign' | 'return-copy';
      request: string;
      key: string;
      copy: string;
      build: BuildOwner;
      demand: PrintedDemand;
    };

export type PurchaseSave =
  | { key: string; record: import('../types/robotics').StoredPurchase | null; update?: 'price' | 'stock' }
  | { allocation: AllocationRequest };
