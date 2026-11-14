import fs from 'node:fs';
import path from 'node:path';

const MAX_ON_HAND = 100_000;

const purchasesFile = (libraryDir) => path.join(libraryDir, 'purchases.json');

export function listPurchases(libraryDir) {
  try {
    return JSON.parse(fs.readFileSync(purchasesFile(libraryDir), 'utf-8'));
  } catch {
    return {};
  }
}

const validOnHand = (n) => n === undefined || (Number.isInteger(n) && n >= 0 && n <= MAX_ON_HAND);

function storedRecord(record) {
  if (!validOnHand(record.onHand)) throw new Error('On hand must be a whole count');

  if (record.priceUsd === undefined) return record.onHand ? { onHand: record.onHand } : null;

  return { ...record, checkedAt: record.checkedAt || new Date().toLocaleDateString('en-CA') };
}

export function savePurchase(libraryDir, { key, record }) {
  if (!key || typeof key !== 'string') throw new Error('Missing purchase key');

  const all = listPurchases(libraryDir);

  const stored = record && storedRecord(record);

  if (stored) all[key] = stored;
  else delete all[key];

  fs.writeFileSync(purchasesFile(libraryDir), JSON.stringify(all, null, 2), 'utf-8');

  return all;
}
