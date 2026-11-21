import type { Purchases } from '../../src/types/robotics';
import type { PurchaseSave } from '../../src/kit/allocationTypes';

export function listPurchases(libraryDir: string): Purchases;
export function savePurchase(libraryDir: string, input: PurchaseSave): Purchases;
