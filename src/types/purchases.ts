import type { EnteredPrice } from './robotics';

export interface PurchaseRecord {
  url?: string;
  asin?: string;
  title?: string;
  packQty: number;
  priceUsd: number;
  entered?: EnteredPrice;
  checkedAt: string;
  note?: string;
  onHand?: number;
}

export interface OnHandRecord {
  onHand: number;
}

export type StoredPurchase = PurchaseRecord | OnHandRecord;

export type Purchases = Record<string, StoredPurchase>;
