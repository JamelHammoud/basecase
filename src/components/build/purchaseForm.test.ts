import { describe, expect, it } from 'vitest';
import type { BomLine } from '../../utils/bom';
import { initialPurchaseForm, purchaseFormError, purchaseRecord } from './purchaseForm';

const line = (o: Partial<BomLine> = {}): BomLine => ({
  key: 'component:pi5',
  category: 'Components',
  name: 'Raspberry Pi 5',
  detail: '',
  qty: 1,
  unit: 'pcs',
  partIds: [],
  urlKind: 'none',
  status: 'unchecked',
  ...o,
});

describe('purchase form', () => {
  it('starts from the product link, or blank for a search link', () => {
    expect(initialPurchaseForm(line({ url: 'https://www.amazon.com/dp/B0CK2FCG1K', urlKind: 'product' }))).toEqual({
      url: 'https://www.amazon.com/dp/B0CK2FCG1K',
      title: '',
      pack: 1,
      price: 0,
      note: '',
    });
    expect(initialPurchaseForm(line({ url: 'https://www.amazon.com/s?k=pi', urlKind: 'search' })).url).toBe('');
    expect(initialPurchaseForm(line({ unit: 'g', qty: 400 })).pack).toBe(1000);
  });

  it('starts from a saved record', () => {
    const record = { url: 'https://www.amazon.com/dp/B000000001', packQty: 2, priceUsd: 9.5, checkedAt: '2026-01-02' };

    expect(initialPurchaseForm(line({ record, urlKind: 'product', url: 'x' }))).toMatchObject({
      url: record.url,
      pack: 2,
      price: 9.5,
    });
  });

  it('asks for the link, a product link, then the price', () => {
    expect(purchaseFormError({ url: '  ', price: 5 })).toBe('Paste the listing link.');
    expect(purchaseFormError({ url: 'https://www.amazon.com/s?k=servo', price: 5 })).toBe(
      'Use an amazon.com product link (…/dp/B0…).',
    );
    expect(purchaseFormError({ url: 'https://www.amazon.com/dp/B0CK2FCG1K', price: 0 })).toBe(
      'Enter the price you saw.',
    );
    expect(purchaseFormError({ url: 'https://amazon.com/Some-Title/dp/b0ck2fcg1k?th=1', price: 12 })).toBe('');
  });

  it('saves a canonical listing with a rounded price', () => {
    const form = {
      url: 'https://www.amazon.com/Pi/dp/b0ck2fcg1k/ref=sr_1',
      title: '  Pi 5 8GB ',
      pack: 2,
      price: 80.456,
      note: ' ',
    };

    expect(purchaseRecord(form, '2026-10-18')).toEqual({
      url: 'https://www.amazon.com/dp/B0CK2FCG1K',
      asin: 'B0CK2FCG1K',
      title: 'Pi 5 8GB',
      packQty: 2,
      priceUsd: 80.46,
      checkedAt: '2026-10-18',
      note: undefined,
    });
  });
});
