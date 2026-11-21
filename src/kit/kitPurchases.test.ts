import { expect, it } from 'vitest';
import { allocatePurchases } from '../../electron/backend/buildAllocations.mjs';
import { purchaseSnapshot } from '../utils/purchaseSnapshot';
import { kitFixture } from './kit.fixtures';
import { kitManifest } from './buildKit';

it('retains quoted identities and unallocated units without exporting local build ownership', () => {
  const job = kitFixture('differential rover');
  const original = kitManifest(job).purchases.find((line) => line.key.startsWith('component:'))!;
  const demand = {
    key: original.key,
    name: original.name,
    qty: original.qty,
    partIds: original.partIds,
    identity: original.identity,
  };
  const purchases = allocatePurchases(
    { [demand.key]: { onHand: 2, priceUsd: 20, packQty: 10, checkedAt: '2026-11-20' } },
    {
      kind: 'reserve',
      request: 'reservation',
      build: { id: 'private-build-id', name: 'Private build', kit: 'a'.repeat(64) },
      demand,
      quantity: 1,
    },
  );
  const before = JSON.stringify(purchases);
  const projected = purchaseSnapshot(purchases);
  const manifest = kitManifest({ ...job, purchases });

  expect(projected[demand.key].onHand).toBe(1);
  expect(projected[demand.key].reservations).toBeUndefined();
  expect(projected[demand.key]).toMatchObject({ priceUsd: 20, packQty: 10 });
  expect(JSON.stringify(manifest)).not.toContain('private-build-id');
  expect(manifest.purchases.find((line) => line.key === demand.key)?.owned).toBe(1);
  expect(JSON.stringify(purchases)).toBe(before);
  expect(purchaseSnapshot(projected)).toEqual(projected);
});
