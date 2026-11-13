import { describe, expect, it, vi } from 'vitest';
import type { Purchases, StoredPurchase } from '../../types/robotics';
import { withPrice } from '../../utils/purchases';

const stored: Purchases = {};
const pending: (() => void)[] = [];

vi.mock('../../utils/platformBridge', () => ({
  platformBridge: {
    listPurchases: () => Promise.resolve({ ...stored }),
    savePurchase: (key: string, record: StoredPurchase | null) => {
      if (record) stored[key] = record;
      else delete stored[key];

      const snapshot = { ...stored };

      return new Promise<Purchases>((resolve) => pending.push(() => resolve(snapshot)));
    },
  },
}));

const { knownPurchases, readOnHand, savePurchaseNow, writeOnHand } = await import('./usePurchases');

const tick = () => new Promise((resolve) => setTimeout(resolve));

const settle = async () => {
  await tick();
  pending.splice(0).forEach((resolve) => resolve());
  await tick();
};

describe('saving purchases', () => {
  it('keeps a count and a price saved together, and reads the new count before the save lands', async () => {
    const first = writeOnHand('servo:sts3215', 2);

    await settle();
    await first;

    const count = writeOnHand('servo:sts3215', 6);

    expect(readOnHand('servo:sts3215')).toBe(6);

    const price = savePurchaseNow(
      'servo:sts3215',
      withPrice(knownPurchases()?.['servo:sts3215'], { packQty: 1, priceUsd: 18, checkedAt: '2026-11-13' }),
    );

    await settle();
    await Promise.all([count, price]);

    expect(stored['servo:sts3215']).toMatchObject({ onHand: 6, priceUsd: 18 });
    expect(knownPurchases()?.['servo:sts3215']).toMatchObject({ onHand: 6, priceUsd: 18 });
  });
});
