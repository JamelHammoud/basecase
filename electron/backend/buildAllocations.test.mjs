import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { listPurchases, savePurchase } from './purchases.mjs';
import { allocatePurchases, allocatedCount } from './buildAllocations.mjs';

const directories = [];
const key = 'component:feetech-sts3215|c001';
const demand = {
  key,
  name: 'Motor',
  qty: 2,
  partIds: ['motor-a', 'motor-b'],
  identity: { manufacturer: 'Feetech', mpn: 'STS3215' },
};
const owner = (id) => ({ id, name: id, kit: 'a'.repeat(64) });
const reserve = (id, quantity = 1, request = crypto.randomUUID()) => ({
  kind: 'reserve',
  request,
  build: owner(id),
  demand,
  quantity,
});
const apply = (dir, allocation) => savePurchase(dir, { allocation });
const directory = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-allocations-'));

  directories.push(dir);

  return dir;
};

afterEach(() => {
  vi.restoreAllMocks();
  directories.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

it('admits one owner for the final component through separate purchasing callers', async () => {
  const dir = directory();

  savePurchase(dir, { key, record: { onHand: 1 } });

  const outcomes = await Promise.allSettled([
    Promise.resolve().then(() => apply(dir, reserve('first'))),
    Promise.resolve().then(() => apply(dir, reserve('second'))),
  ]);
  const stored = listPurchases(dir)[key];

  expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
  expect(allocatedCount(stored)).toBe(1);
  expect(stored.onHand).toBe(1);
  expect(stored.reservations).toHaveLength(1);
});

it('retains ownership after stock correction, stale listing edits and explicit partial returns', () => {
  const dir = directory();
  const request = reserve('first', 2);

  savePurchase(dir, { key, record: { onHand: 3 } });
  apply(dir, request);
  savePurchase(dir, { key, record: { onHand: 1 } });
  expect(allocatedCount(listPurchases(dir)[key])).toBe(2);
  expect(() => apply(dir, reserve('second'))).toThrow('Unallocated stock');
  apply(dir, { ...request, kind: 'return', request: 'return-one', quantity: 1 });
  expect(allocatedCount(listPurchases(dir)[key])).toBe(1);
  expect(listPurchases(dir)[key].reservations[0].returned).toBe(1);
  expect(() => apply(dir, reserve('second'))).toThrow('Unallocated stock');
  apply(dir, { ...request, kind: 'return', request: 'return-two', quantity: 1 });
  apply(dir, reserve('second'));
  expect(listPurchases(dir)[key].reservations.map((entry) => [entry.build.id, entry.quantity])).toEqual([
    ['first', 0],
    ['second', 1],
  ]);
});

it('deduplicates requests and refuses changed demand, excess demand and forged stock ownership', () => {
  const dir = directory();
  const request = reserve('first');

  savePurchase(dir, { key, record: { onHand: 10 } });

  const once = apply(dir, request);

  expect(apply(dir, request)).toEqual(once);
  expect(() => apply(dir, { ...request, quantity: 2 })).toThrow('request');
  expect(() => apply(dir, { ...request, request: 'excess', quantity: 2 })).toThrow('demand');
  expect(() => apply(dir, { ...request, request: 'changed', demand: { ...demand, qty: 20 } })).toThrow('demand');
  savePurchase(dir, { key, record: { onHand: 10, reservations: [] } });
  expect(allocatedCount(listPurchases(dir)[key])).toBe(1);
  savePurchase(dir, { key, record: null });
  expect(allocatedCount(listPurchases(dir)[key])).toBe(1);
});

it('preserves physical units and source identities when a supplier sells packs', () => {
  const dir = directory();
  const identity = {
    ...demand.identity,
    supplier: 'Shop',
    supplierPartNumber: 'PACK-10',
    orderingUnit: 'pack',
    unitsPerOrder: 10,
  };

  savePurchase(dir, { key, record: { onHand: 3, priceUsd: 20, packQty: 10, identity } });
  apply(dir, { ...reserve('first', 2), demand: { ...demand, identity } });
  expect(allocatedCount(listPurchases(dir)[key])).toBe(2);
  expect(listPurchases(dir)[key].reservations[0].demand).toEqual({ ...demand, identity });
});

it('publishes neither a stock change nor an allocation after interrupted replacement', () => {
  const dir = directory();

  savePurchase(dir, { key, record: { onHand: 1 } });

  const before = listPurchases(dir);

  vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
    throw new Error('Interrupted replacement');
  });
  expect(() => apply(dir, reserve('first'))).toThrow('Interrupted replacement');
  expect(listPurchases(dir)).toEqual(before);
});

it('does not resurrect corrected stock when a stale quote or listing is saved', () => {
  const dir = directory();
  const stale = { onHand: 10, priceUsd: 20, packQty: 10, checkedAt: '2026-11-20' };

  savePurchase(dir, { key, record: stale });
  apply(dir, reserve('first'));
  savePurchase(dir, { key, record: { onHand: 1 }, update: 'stock' });
  savePurchase(dir, { key, record: stale, update: 'price' });
  expect(listPurchases(dir)[key].onHand).toBe(1);
  expect(allocatedCount(listPurchases(dir)[key])).toBe(1);
  expect(() => apply(dir, reserve('second'))).toThrow('Unallocated stock');
});

it('preserves the current supplier record when stock is edited from a stale purchase view', () => {
  const dir = directory();
  const stale = { onHand: 10, priceUsd: 20, packQty: 10, checkedAt: '2026-11-20' };

  savePurchase(dir, { key, record: stale });
  savePurchase(dir, { key, record: { ...stale, priceUsd: 30, packQty: 20 }, update: 'price' });
  savePurchase(dir, { key, record: { ...stale, onHand: 1 }, update: 'stock' });
  expect(listPurchases(dir)[key]).toMatchObject({ onHand: 1, priceUsd: 30, packQty: 20 });
  savePurchase(dir, { key, record: null, update: 'stock' });
  expect(listPurchases(dir)[key]).toMatchObject({ priceUsd: 30, packQty: 20 });
  expect(listPurchases(dir)[key].onHand).toBeUndefined();
});

it.each([-1, 0, 0.5, 100001, NaN, Infinity])('refuses unsupported reservation quantity %s', (quantity) => {
  expect(() => allocatePurchases({ [key]: { onHand: 10 } }, reserve('first', quantity))).toThrow();
});

it('retains request acknowledgment when bounded history is full without admitting new operations', () => {
  let stock = { [key]: { onHand: 2 } };
  const original = reserve('first', 1, 'first-request');

  for (let index = 0; index < 1000; index++) {
    stock = allocatePurchases(stock, {
      ...original,
      kind: index % 2 === 0 ? 'reserve' : 'return',
      request: index === 0 ? original.request : `operation-${index}`,
    });
  }

  expect(stock[key].reservations[0].events).toHaveLength(1000);
  expect(allocatePurchases(stock, original)).toEqual(stock);
  expect(() => allocatePurchases(stock, reserve('first'))).toThrow('history is full');
  expect(allocatedCount(stock[key])).toBe(0);
});

it('keeps a final full return available at the event bound without truncating ownership history', () => {
  let stock = { [key]: { onHand: 2 } };
  const request = reserve('first', 2);

  for (let index = 0; index < 999; index++) {
    stock = allocatePurchases(stock, {
      ...request,
      kind: index % 2 === 0 ? 'reserve' : 'return',
      request: `bounded-${index}`,
    });
  }

  expect(allocatedCount(stock[key])).toBe(2);
  expect(() => allocatePurchases(stock, { ...request, kind: 'return', quantity: 1 })).toThrow('history is full');

  const returned = allocatePurchases(stock, { ...request, kind: 'return' });

  expect(allocatedCount(returned[key])).toBe(0);
  expect(returned[key].reservations[0].events).toHaveLength(1000);
});
