import fs from 'node:fs';
import path from 'node:path';
import { withStoredPurchase } from '../purchaseRecord.mjs';

const purchasesFile = (libraryDir) => path.join(libraryDir, 'purchases.json');

export function listPurchases(libraryDir) {
  try {
    return JSON.parse(fs.readFileSync(purchasesFile(libraryDir), 'utf-8'));
  } catch {
    return {};
  }
}

export function savePurchase(libraryDir, payload) {
  const all = withStoredPurchase(listPurchases(libraryDir), payload, new Date().toLocaleDateString('en-CA'));

  fs.writeFileSync(purchasesFile(libraryDir), JSON.stringify(all, null, 2), 'utf-8');

  return all;
}
