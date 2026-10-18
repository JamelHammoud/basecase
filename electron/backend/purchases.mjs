import fs from 'node:fs';
import path from 'node:path';

const purchasesFile = (libraryDir) => path.join(libraryDir, 'purchases.json');

export function listPurchases(libraryDir) {
  try {
    return JSON.parse(fs.readFileSync(purchasesFile(libraryDir), 'utf-8'));
  } catch {
    return {};
  }
}

export function savePurchase(libraryDir, { key, record }) {
  if (!key || typeof key !== 'string') throw new Error('Missing purchase key');

  const all = listPurchases(libraryDir);

  if (record) all[key] = { ...record, checkedAt: record.checkedAt || new Date().toLocaleDateString('en-CA') };
  else delete all[key];

  fs.writeFileSync(purchasesFile(libraryDir), JSON.stringify(all, null, 2), 'utf-8');

  return all;
}
