import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listPurchases, savePurchase } from './purchases.mjs';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'purchases-'));
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const servo = 'component:feetech-sts3215|c001';
const old = {
  url: 'https://www.amazon.com/dp/B0ABCDEFGH',
  asin: 'B0ABCDEFGH',
  packQty: 1,
  priceUsd: 17.5,
  checkedAt: '2026-10-01',
};

describe('purchases', () => {
  it('loads an old purchases.json without counts unchanged', () => {
    fs.writeFileSync(path.join(dir, 'purchases.json'), JSON.stringify({ [servo]: old }, null, 2));

    expect(listPurchases(dir)).toEqual({ [servo]: old });
  });

  it('keeps a part owned with no price as a count alone, without a check date', () => {
    expect(savePurchase(dir, { key: servo, record: { onHand: 6 } })).toEqual({ [servo]: { onHand: 6 } });
    expect(savePurchase(dir, { key: servo, record: { ...old, onHand: 6 } })[servo]).toEqual({ ...old, onHand: 6 });
  });

  it('drops a record left with neither a price nor a count', () => {
    savePurchase(dir, { key: servo, record: { onHand: 6 } });

    expect(savePurchase(dir, { key: servo, record: { onHand: 0 } })).toEqual({});
    expect(savePurchase(dir, { key: servo, record: {} })).toEqual({});
  });

  it('refuses a count that is negative or not whole', () => {
    expect(() => savePurchase(dir, { key: servo, record: { onHand: -1 } })).toThrow();
    expect(() => savePurchase(dir, { key: servo, record: { onHand: 2.5 } })).toThrow();
    expect(listPurchases(dir)).toEqual({});
  });
});
