import { describe, expect, it } from 'vitest';
import { checkedPrice, onHandRefusals, ownedSplit, withOnHand, withPrice } from './onHand';

const price = { packQty: 1, priceUsd: 17.5, checkedAt: '2026-11-01' };

describe('on hand', () => {
  it('splits a line into owned and to-buy units', () => {
    expect(ownedSplit(8, 6)).toEqual({ owned: 6, toBuy: 2 });
    expect(ownedSplit(13, 100)).toEqual({ owned: 13, toBuy: 0 });
    expect(ownedSplit(4, 0)).toEqual({ owned: 0, toBuy: 4 });
  });

  it('keeps a checked price when the count changes, and drops a record left with nothing', () => {
    expect(withOnHand(price, 6)).toMatchObject({ ...price, onHand: 6 });
    expect(withOnHand({ ...price, onHand: 6 }, 0)).toMatchObject({ ...price, onHand: undefined });
    expect(withOnHand(undefined, 6)).toEqual({ onHand: 6 });
    expect(withOnHand({ onHand: 6 }, 0)).toBeNull();
  });

  it('keeps the count when a price is saved or removed', () => {
    expect(withPrice({ onHand: 6 }, price)).toEqual({ ...price, onHand: 6 });
    expect(withPrice({ ...price, onHand: 6 }, null)).toEqual({ onHand: 6 });
    expect(withPrice(price, null)).toBeNull();
    expect(checkedPrice({ onHand: 6 })).toBeUndefined();
    expect(checkedPrice(price)).toBe(price);
  });

  it('refuses unknown keys and counts that are negative or not whole', () => {
    const known = (key: string) => key === 'component:feetech-sts3215|c001';
    const refusals = onHandRefusals(
      [
        { key: 'component:feetech-sts3215|c001', count: 6 },
        { key: 'component:not-a-part', count: 1 },
        { key: 'component:feetech-sts3215|c001', count: -1 },
        { key: 'component:feetech-sts3215|c001', count: 2.5 },
      ],
      known,
    );

    expect(refusals).toEqual([
      'component:not-a-part isn’t a catalog key',
      'component:feetech-sts3215|c001: -1 isn’t a whole count from 0 to 100000',
      'component:feetech-sts3215|c001: 2.5 isn’t a whole count from 0 to 100000',
    ]);
  });
});
