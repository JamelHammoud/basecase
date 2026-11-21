import { checkedPurchasingEvidence } from './offerValidation.mjs';
import { allocatePurchases, preserveAllocations } from './buildAllocations.mjs';
import fs from 'node:fs';
import path from 'node:path';

const MAX_ON_HAND = 100_000;

const purchasesFile = (libraryDir) => path.join(libraryDir, 'purchases.json');

export function listPurchases(libraryDir) {
  try {
    return JSON.parse(fs.readFileSync(purchasesFile(libraryDir), 'utf-8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;

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

export function savePurchase(libraryDir, input) {
  const all = listPurchases(libraryDir);

  if ('allocation' in input) return writePurchases(libraryDir, allocatePurchases(all, input.allocation));

  const { key, record } = input;

  if (!key || typeof key !== 'string') throw new Error('Missing purchase key');

  const stored = preserveAllocations(record && storedRecord(record), all[key], input.update);

  if (stored) Object.defineProperty(all, key, { value: stored, enumerable: true, writable: true, configurable: true });
  else delete all[key];

  return writePurchases(libraryDir, all);
}

function writePurchases(libraryDir, all) {
  const file = purchasesFile(libraryDir);
  const temporary = `${file}.pending`;

  fs.writeFileSync(temporary, JSON.stringify(all, null, 2), 'utf-8');
  fs.renameSync(temporary, file);

  return all;
}
