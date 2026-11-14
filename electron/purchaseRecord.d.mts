import type { Purchases, StoredPurchase } from '../src/types/robotics';

export const MAX_ON_HAND: number;

export function storedPurchase(record: StoredPurchase | null, today: string): StoredPurchase | null;

export function withStoredPurchase(
  all: Purchases,
  payload: { key: string; record: StoredPurchase | null },
  today: string,
): Purchases;
