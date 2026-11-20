import { checkedPurchasingEvidence } from '../../../../electron/backend/offerValidation.mjs';
import type { Purchases, StoredPurchase } from '../../../types/robotics';
import { checkedPrice, isOnHandCount } from '../../onHand';
import { idbGet, idbWrite } from './idb';

export const listPurchases = async () => (await idbGet<Purchases>('settings', 'purchases')) ?? {};

function storedRecord(record: StoredPurchase): StoredPurchase | null {
  if (record.onHand !== undefined && !isOnHandCount(record.onHand)) throw new Error('On hand must be a whole count');

  const price = checkedPrice(record);
  const evidence = checkedPurchasingEvidence(record);

  if (price) return { ...price, ...evidence, checkedAt: price.checkedAt || new Date().toLocaleDateString('en-CA') };

  return record.onHand || Object.keys(evidence).length ? { onHand: record.onHand, ...evidence } : null;
}

async function persistPurchase({ key, record }: { key: string; record: StoredPurchase | null }) {
  if (!key || typeof key !== 'string') throw new Error('Missing purchase key');

  const all = await listPurchases();
  const stored = record && storedRecord(record);

  if (stored) Object.defineProperty(all, key, { value: stored, enumerable: true, writable: true, configurable: true });
  else delete all[key];

  await idbWrite([{ store: 'settings', key: 'purchases', kind: 'put', value: all }]);

  return all;
}

let writeQueue: Promise<unknown> = Promise.resolve();

export function savePurchase(input: { key: string; record: StoredPurchase | null }): Promise<Purchases> {
  const saved = writeQueue.then(() => persistPurchase(input));

  writeQueue = saved.catch(() => undefined);

  return saved;
}
