import { checkedPurchasingEvidence } from './offerValidation.mjs';
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

  const evidence = checkedPurchasingEvidence(record);

  if (record.priceUsd === undefined)
    return record.onHand || Object.keys(evidence).length ? { onHand: record.onHand, ...evidence } : null;

  return { ...record, checkedAt: record.checkedAt || new Date().toLocaleDateString('en-CA') };
}

export function savePurchase(libraryDir, { key, record }) {
  if (!key || typeof key !== 'string') throw new Error('Missing purchase key');

  const all = listPurchases(libraryDir);

  const stored = record && storedRecord(record);

  if (stored) all[key] = stored;
  else delete all[key];

  const file = purchasesFile(libraryDir);
  const temporary = `${file}.pending`;

  fs.writeFileSync(temporary, JSON.stringify(all, null, 2), 'utf-8');
  fs.renameSync(temporary, file);

  return all;
}
