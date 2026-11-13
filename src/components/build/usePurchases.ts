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

let latestSave = 0;

function withRecord(current: Purchases, key: string, record: StoredPurchase | null): Purchases {
  const next = { ...current };

  if (record) next[key] = record;
  else delete next[key];

  return next;
}

export async function savePurchaseNow(key: string, record: StoredPurchase | null) {
  const save = ++latestSave;

  if (purchaseCache) publish(withRecord(purchaseCache, key, record));

  const saved = await platformBridge.savePurchase(key, record);

  if (save === latestSave) publish(saved);
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
