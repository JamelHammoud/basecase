import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { buildBom } from '../../utils/bom';
import { comparePurchasing, confirmOffer } from '../../utils/supplierOffers';
import { importOffers, OFFER_COLUMNS } from '../../utils/supplierOfferCsv';
import type { Purchases } from '../../types/robotics';
import { useSupplierOffers } from './useSupplierOffers';
import { OfferComparison } from './OfferComparison';
import { OfferMatch } from './OfferMatch';

const key = 'component:raspberry-pi-pico-2';
const plan = { destination: 'US-CA', requiredBy: '2026-12-01' };
const now = '2026-11-20T12:00:00Z';
const [offer] = importOffers(
  `${OFFER_COLUMNS.join(',')}\nRaspberry Pi,SC1631,Shop,00012,pack,2,1:12,10,USD,US-CA,${now},,2026-11-23,2026-11-25,quote-1\n`,
  'quotes.csv',
);
const bom = buildBom({
  parts: [],
  project: { printer: 'default', material: 'PLA', infillPct: 15, extras: [{ key, qty: 3 }] },
  purchases: {},
  measures: {},
});
const line = bom.lines.find((item) => item.key === key)!;
const entry = confirmOffer(offer, line, 4);

it('keeps missing selection visible beside saved quotes and restores corrected packaging for editing', () => {
  const book = { offers: [entry] };
  const result = comparePurchasing({ bom, purchases: { [key]: { supplierOffers: book } }, plan, now });
  const comparison = renderToStaticMarkup(
    createElement(OfferComparison, { result, books: () => book, onEdit: vi.fn(), onSelect: vi.fn(), saving: false }),
  );
  const match = renderToStaticMarkup(
    createElement(OfferMatch, {
      offer,
      lines: bom.lines,
      initialKey: key,
      unitsPerOrder: entry.unitsPerOrder,
      saving: false,
      onConfirm: vi.fn(),
    }),
  );

  expect(comparison).toContain('Select an offer');
  expect(comparison).toContain('Nov 23');
  expect(comparison).not.toContain('2026-11-23');
  expect(match).toContain('value="4"');
  expect(offer.identity.unitsPerOrder).toBe(2);
});

it('protects a pending confirmation from overlapping writes and recovers after a refused save', async () => {
  let purchases: Purchases = { [key]: { supplierOffers: { offers: [entry], selectedId: offer.id } } };
  let controls!: ReturnType<typeof useSupplierOffers>;
  let finish!: () => void;
  const saved = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const save = vi.fn(async (_key: string, record: Purchases[string] | null) => {
    await saved;
    purchases = { [key]: record! };
  });

  function Host() {
    controls = useSupplierOffers({ bom, purchases, scene: 'arm', save });

    return null;
  }

  renderToStaticMarkup(createElement(Host));

  const second = { ...offer, id: 'second' };
  const third = { ...offer, id: 'third' };
  const pending = controls.confirm(second, key, 6);

  await controls.confirm(third, key, 8);
  expect(save).toHaveBeenCalledTimes(1);
  finish();
  await pending;
  expect(purchases[key].supplierOffers?.offers.map((item) => item.offer.id)).toEqual([offer.id, 'second']);
  expect(purchases[key].supplierOffers?.selectedId).toBe(offer.id);
  renderToStaticMarkup(createElement(Host));
  save.mockRejectedValueOnce(new Error('publication refused'));
  await controls.confirm(third, key, 8);
  expect(purchases[key].supplierOffers?.offers).toHaveLength(2);
  await controls.confirm(third, key, 8);
  expect(purchases[key].supplierOffers?.offers.map((item) => item.offer.id)).toEqual([offer.id, 'second', 'third']);
});
