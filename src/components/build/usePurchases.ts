import { useEffect, useState } from 'react';
import type { PurchaseRecord } from '../../types/robotics';
import { platformBridge } from '../../utils/platformBridge';

type Purchases = Record<string, PurchaseRecord>;

let purchaseCache: Purchases | null = null;
const purchaseListeners = new Set<(p: Purchases) => void>();

const publish = (next: Purchases) => {
  purchaseCache = next;
  purchaseListeners.forEach((l) => l(next));
};

export function usePurchases(): [Purchases, (key: string, r: PurchaseRecord | null) => Promise<void>] {
  const [purchases, setPurchases] = useState<Purchases>(purchaseCache ?? {});

  useEffect(() => {
    purchaseListeners.add(setPurchases);

    if (!purchaseCache) platformBridge.listPurchases().then(publish);

    return () => {
      purchaseListeners.delete(setPurchases);
    };
  }, []);

  const save = async (key: string, record: PurchaseRecord | null) => {
    publish(await platformBridge.savePurchase(key, record));
  };

  return [purchases, save];
}
