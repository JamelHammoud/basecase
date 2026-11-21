import { useEffect, useState } from 'react';
import type { Purchases, StoredPurchase } from '../../types/robotics';
import { platformBridge } from '../../utils/platformBridge';
import type { AllocationRequest } from '../../kit/allocationTypes';

let purchaseCache: Purchases | null = null;
let publication = 0;
const purchaseListeners = new Set<(p: Purchases) => void>();

const publish = (next: Purchases) => {
  publication++;
  purchaseCache = next;
  purchaseListeners.forEach((l) => l(next));
};

export const knownPurchases = () => purchaseCache;

export async function refreshPurchases() {
  const started = publication;
  const next = await platformBridge.listPurchases();

  if (started === publication) publish(next);

  return next;
}

export async function allocatePurchase(request: AllocationRequest) {
  const next = await platformBridge.allocatePurchase(request);

  publish(next);

  return next;
}

export async function storePurchase(
  key: string,
  record: StoredPurchase | null,
  update: 'price' | 'stock' = 'price',
): Promise<Purchases> {
  const next = await platformBridge.savePurchase(key, record, update);

  publish(next);

  return next;
}

export function usePurchases(): [
  Purchases,
  (key: string, r: StoredPurchase | null, update?: 'price' | 'stock') => Promise<void>,
] {
  const [purchases, setPurchases] = useState<Purchases>(purchaseCache ?? {});

  useEffect(() => {
    purchaseListeners.add(setPurchases);

    if (!purchaseCache) void refreshPurchases();

    const refresh = () => {
      void refreshPurchases();
    };

    if (typeof window !== 'undefined') window.addEventListener('focus', refresh);

    return () => {
      purchaseListeners.delete(setPurchases);

      if (typeof window !== 'undefined') window.removeEventListener('focus', refresh);
    };
  }, []);

  const save = async (key: string, record: StoredPurchase | null, update: 'price' | 'stock' = 'price') => {
    await storePurchase(key, record, update);
  };

  return [purchases, save];
}
