import { useEffect, useState } from 'react';
import type { Purchases, StoredPurchase } from '../../types/robotics';
import { platformBridge } from '../../utils/platformBridge';

let purchaseCache: Purchases | null = null;
const purchaseListeners = new Set<(p: Purchases) => void>();

const publish = (next: Purchases) => {
  purchaseCache = next;
  purchaseListeners.forEach((l) => l(next));
};

export const knownPurchases = () => purchaseCache;

export async function storePurchase(key: string, record: StoredPurchase | null): Promise<Purchases> {
  const next = await platformBridge.savePurchase(key, record);

  publish(next);

  return next;
}

export function usePurchases(): [Purchases, (key: string, r: StoredPurchase | null) => Promise<void>] {
  const [purchases, setPurchases] = useState<Purchases>(purchaseCache ?? {});

  useEffect(() => {
    purchaseListeners.add(setPurchases);

    if (!purchaseCache) platformBridge.listPurchases().then(publish);

    return () => {
      purchaseListeners.delete(setPurchases);
    };
  }, []);

  const save = async (key: string, record: StoredPurchase | null) => {
    await storePurchase(key, record);
  };

  return [purchases, save];
}
