export interface EnteredPrice {
  amount: number;
  currency: string;
}

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

export type StoredPurchase = PurchaseRecord | { onHand: number };

export type Purchases = Record<string, StoredPurchase>;
