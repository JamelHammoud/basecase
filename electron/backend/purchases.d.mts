import type { Purchases, StoredPurchase } from '../../src/types/robotics';

export function listPurchases(libraryDir: string): Purchases;
export function savePurchase(libraryDir: string, input: { key: string; record: StoredPurchase | null }): Purchases;
