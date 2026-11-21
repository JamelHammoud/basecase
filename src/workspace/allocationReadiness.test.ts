import { expect, it } from 'vitest';
import { projectFingerprint } from './runReadiness';
import { kitFixture } from '../kit/kit.fixtures';
import { resolvePrinter } from '../data/printers';
import { allocatePurchases } from '../../electron/backend/buildAllocations.mjs';
import { purchaseSnapshot } from '../utils/purchaseSnapshot';
import { buildBom } from '../utils/bom';

it('keeps Checks inputs stable when components are allocated while preserving ordinary stock corrections', () => {
  const job = kitFixture('differential rover');
  const key = 'component:feetech-sts3215|c001';
  const purchases = { [key]: { onHand: 2, priceUsd: 20, packQty: 1, checkedAt: '2026-11-20' } };
  const assigned = allocatePurchases(purchases, {
    kind: 'reserve',
    request: 'reserve-motor',
    build: { id: 'rover', name: 'Rover', kit: 'a'.repeat(64) },
    demand: { key, name: 'Motor', qty: 3, partIds: ['motor-a', 'motor-b', 'motor-c'] },
    quantity: 1,
  });
  const printer = resolvePrinter(undefined, []);
  const fingerprint = (stock: object) =>
    projectFingerprint(job.parts, job.project, printer, {
      purchases: stock,
      money: { code: 'USD', ratesDate: '2026-11-20' },
    });

  expect(fingerprint(assigned)).toBe(fingerprint(purchases));
  expect(fingerprint({ ...assigned, [key]: { ...assigned[key], onHand: 1 } })).not.toBe(fingerprint(purchases));
  expect(buildBom({ ...job, purchases: purchaseSnapshot(assigned, 'owned') })).toEqual(buildBom({ ...job, purchases }));
  expect(buildBom({ ...job, purchases: assigned }).lines.find((line) => line.key === key)?.owned).toBe(1);
});
