import { expect, it } from 'vitest';
import { allocatePurchases, allocatedCount } from './buildAllocations.mjs';

it('keeps original and repair reservations held independently until explicit physical return', () => {
  const build = { id: 'unit-one', name: 'Unit one', kit: 'a'.repeat(64) };
  const replacement = { ...build, repair: 'repair-one', revision: 'b'.repeat(64) };
  const demand = { key: 'component:servo', name: 'Servo', qty: 1, partIds: ['servo'] };
  let purchases = { [demand.key]: { onHand: 2 } };

  purchases = allocatePurchases(purchases, { kind: 'reserve', request: 'original', build, demand, quantity: 1 });
  purchases = allocatePurchases(purchases, {
    kind: 'reserve',
    request: 'replacement',
    build: replacement,
    demand,
    quantity: 1,
  });
  expect(allocatedCount(purchases[demand.key])).toBe(2);
  expect(purchases[demand.key].reservations.map((owner) => owner.quantity)).toEqual([1, 1]);
  expect(
    allocatePurchases(purchases, { kind: 'reserve', request: 'replacement', build: replacement, demand, quantity: 1 }),
  ).toEqual(purchases);
  expect(() =>
    allocatePurchases(purchases, { kind: 'reserve', request: 'another', build: replacement, demand, quantity: 1 }),
  ).toThrow();
  purchases = allocatePurchases(purchases, { kind: 'return', request: 'returned', build, demand, quantity: 1 });
  expect(purchases[demand.key].reservations.map((owner) => owner.quantity)).toEqual([1, 0]);
  expect(allocatedCount(purchases[demand.key])).toBe(1);
});
