import type { PurchaseRecord, StoredPurchase } from '../types/robotics';

export { MAX_ON_HAND } from '../../electron/purchaseRecord.mjs';

export const pricedRecord = (stored: StoredPurchase | undefined): PurchaseRecord | undefined =>
  stored && 'priceUsd' in stored ? stored : undefined;

export const onHandOf = (stored: StoredPurchase | undefined): number => stored?.onHand ?? 0;

export function ownedSplit(qty: number, onHand: number) {
  const owned = Math.min(qty, Math.max(0, onHand));

  return { owned, toBuy: qty - owned };
}

function stored(record: PurchaseRecord | undefined, onHand: number): StoredPurchase | null {
  if (!record) return onHand > 0 ? { onHand } : null;

  const price: PurchaseRecord = { ...record };

  delete price.onHand;

  return onHand > 0 ? { ...price, onHand } : price;
}

export const withOnHand = (current: StoredPurchase | undefined, onHand: number) =>
  stored(pricedRecord(current), onHand);

export const withPrice = (current: StoredPurchase | undefined, record: PurchaseRecord | null) =>
  stored(record ?? undefined, onHandOf(current));
