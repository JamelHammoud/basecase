import type { AllocationRequest } from '../../src/kit/allocationTypes';
import type { Purchases, StoredPurchase } from '../../src/types/robotics';

export function allocatedCount(record: StoredPurchase | undefined): number;
export function preserveAllocations(
  record: StoredPurchase | null,
  previous: StoredPurchase | undefined,
  update?: 'price' | 'stock',
): StoredPurchase | null;
export function allocatePurchases(purchases: Purchases, request: AllocationRequest, now?: string): Purchases;

export function sameBuildOwner(
  a: import('../../src/kit/allocationTypes').BuildOwner,
  b: import('../../src/kit/allocationTypes').BuildOwner,
): boolean;
