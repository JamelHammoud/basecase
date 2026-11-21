import { checkedPurchasingEvidence } from '../../../../electron/backend/offerValidation.mjs';
import type { Purchases, StoredPurchase } from '../../../types/robotics';
import { checkedPrice, isOnHandCount } from '../../onHand';
import { allocatePurchases, preserveAllocations } from '../../../../electron/backend/buildAllocations.mjs';
import type { PurchaseSave } from '../../../kit/allocationTypes';
import { idbGet, idbSettingsUpdate } from './idb';

export const listPurchases = async () => (await idbGet<Purchases>('settings', 'purchases')) ?? {};

function storedRecord(record: StoredPurchase): StoredPurchase | null {
  if (record.onHand !== undefined && !isOnHandCount(record.onHand)) throw new Error('On hand must be a whole count');

  const price = checkedPrice(record);
  const evidence = checkedPurchasingEvidence(record);

  if (price) return { ...price, ...evidence, checkedAt: price.checkedAt || new Date().toLocaleDateString('en-CA') };

  return record.onHand || Object.keys(evidence).length ? { onHand: record.onHand, ...evidence } : null;
}

function changedPurchase(all: Purchases, input: PurchaseSave): Purchases {
  if ('allocation' in input) return allocatePurchases(all, input.allocation);

  const { key, record } = input;

  if (!key || typeof key !== 'string') throw new Error('Missing purchase key');

  const stored = preserveAllocations(record && storedRecord(record), all[key], input.update);
  const next = { ...all };

  if (stored) Object.defineProperty(next, key, { value: stored, enumerable: true, writable: true, configurable: true });
  else delete next[key];

  return next;
}

export function savePurchase(input: PurchaseSave): Promise<Purchases> {
  return idbSettingsUpdate(['purchases'], ([value]) => {
    const next = changedPurchase((value as Purchases | undefined) ?? {}, input);

    return { puts: { purchases: next }, result: next };
  });
}
