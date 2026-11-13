import { useEffect, useState } from 'react';
import type { Purchases, StoredPurchase } from '../../types/robotics';
import { platformBridge } from '../../utils/platformBridge';
import { onHandOf, withOnHand } from '../../utils/purchases';

let purchaseCache: Purchases | null = null;
const purchaseListeners = new Set<(p: Purchases) => void>();

const publish = (next: Purchases) => {
  purchaseCache = next;
  purchaseListeners.forEach((l) => l(next));
};

export const knownPurchases = () => purchaseCache;

export async function savePurchaseNow(key: string, record: StoredPurchase | null) {
  publish(await platformBridge.savePurchase(key, record));
}

export const readOnHand = (key: string) => onHandOf(purchaseCache?.[key]);

export async function writeOnHand(key: string, onHand: number) {
  const current = purchaseCache ?? (await platformBridge.listPurchases());

  await savePurchaseNow(key, withOnHand(current[key], onHand));
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

  return [purchases, savePurchaseNow];
}
