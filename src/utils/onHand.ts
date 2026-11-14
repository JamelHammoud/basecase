import type { PurchaseRecord, StoredPurchase } from '../types/robotics';

export const MAX_ON_HAND = 100_000;

export interface OwnedSplit {
  owned: number;
  toBuy: number;
}

export interface OnHandCount {
  key: string;
  count: number;
}

export const checkedPrice = (stored: StoredPurchase | undefined): PurchaseRecord | undefined =>
  stored && 'priceUsd' in stored ? stored : undefined;

export const onHandOf = (stored: StoredPurchase | undefined): number => stored?.onHand ?? 0;

export function ownedSplit(qty: number, onHand: number): OwnedSplit {
  const owned = Math.min(qty, Math.max(0, onHand));

  return { owned, toBuy: qty - owned };
}

export function withOnHand(stored: StoredPurchase | undefined, count: number): StoredPurchase | null {
  const price = checkedPrice(stored);
  const onHand = count > 0 ? count : undefined;

  if (price) return { ...price, onHand };

  return onHand ? { onHand } : null;
}

export function withPrice(stored: StoredPurchase | undefined, record: PurchaseRecord | null): StoredPurchase | null {
  const onHand = onHandOf(stored) || undefined;

  if (record) return { ...record, onHand };

  return onHand ? { onHand } : null;
}

export const isOnHandCount = (count: unknown): count is number =>
  typeof count === 'number' && Number.isInteger(count) && count >= 0 && count <= MAX_ON_HAND;

export function onHandRefusals(counts: OnHandCount[], known: (key: string) => boolean): string[] {
  return counts.flatMap(({ key, count }) => {
    if (!known(key)) return [`${key} isn’t a catalog key`];

    return isOnHandCount(count) ? [] : [`${key}: ${count} isn’t a whole count from 0 to ${MAX_ON_HAND}`];
  });
}
