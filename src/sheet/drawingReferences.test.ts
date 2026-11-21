import { expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { buildDrawings } from './drawings';
import { sheetPart } from './sheet.fixtures';

it('keeps exact purchased supplier references without generating bought-part dimensions', async () => {
  const identity = {
    manufacturer: 'FEETECH',
    mpn: 'STS3215-C001',
    supplier: 'Workshop supplier',
    supplierPartNumber: 'PACK-STS-C001',
    orderingUnit: 'pack',
    unitsPerOrder: 4,
    sourceUrl: 'https://example.com/catalog/sts3215-c001',
  };
  const { manifest, bytes } = await buildDrawings({
    parts: [sheetPart({ kind: 'component', componentId: 'feetech-sts3215', componentVariant: 'c001' })],
    source: { id: 'catalog', name: 'Catalog references', fingerprint: 'source' },
    options: { frame: 'part', plane: 'xy', scale: 1 },
    purchases: {
      'component:feetech-sts3215|c001': { packQty: 4, priceUsd: 80, checkedAt: '2026-11-16T00:00:00Z', identity },
    },
  });
  const files = unzipSync(bytes);

  expect(manifest.sheets).toHaveLength(0);
  expect(manifest.references[0].identity).toEqual(identity);
  expect(strFromU8(files['references.svg'])).toContain('PACK-STS-C001');
  expect(strFromU8(files['references.svg'])).toContain(identity.sourceUrl);
  expect(Object.keys(files).some((name) => name.endsWith('.stl'))).toBe(false);
});

it('refuses manufacturing dimensions for unreferenced bought meshes and estimated stand-ins', async () => {
  for (const part of [sheetPart({ kind: 'servo' }), sheetPart({ mechanicalTag: 'Off-the-shelf COTS' })]) {
    await expect(
      buildDrawings({
        parts: [part],
        source: { id: 'stand-in', name: 'Stand-in', fingerprint: 'source' },
        options: { frame: 'part', plane: 'xy', scale: 1 },
      }),
    ).rejects.toThrow('fabricated solid');
  }
});
